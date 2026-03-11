import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { EInvoice, EInvoiceStatus, EInvoiceType } from './entities/e-invoice.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { SalesService } from 'src/sales/sales.service';
import { GibProvider } from './providers/gib.provider';
import { UblXmlBuilder, UblInvoiceData, UblInvoiceLine } from './ubl/ubl-xml.builder';
import { CreateEInvoiceDto, ListEInvoicesQueryDto } from './dto/e-invoice.dto';

@Injectable()
export class EInvoiceService {
  private readonly xmlBuilder = new UblXmlBuilder();

  constructor(
    @InjectRepository(EInvoice)
    private readonly repo: Repository<EInvoice>,
    private readonly appContext: AppContextService,
    private readonly salesService: SalesService,
    private readonly gibProvider: GibProvider,
  ) {}

  private tenantId()  { return this.appContext.getTenantIdOrThrow(); }
  private userId()    { return this.appContext.getUserIdOrThrow(); }

  private async findOrThrow(id: string): Promise<EInvoice> {
    const inv = await this.repo.findOne({ where: { id, tenantId: this.tenantId() } });
    if (!inv) throw new NotFoundException(`e-Fatura bulunamadı: ${id}`);
    return inv;
  }

  /** Satışa bağlı e-fatura/e-arşiv belgesi oluşturur (DRAFT statüsünde) */
  async createFromSale(saleId: string, dto: CreateEInvoiceDto): Promise<EInvoice> {
    const tenantId = this.tenantId();
    const userId   = this.userId();

    // Aynı satış için daha önce oluşturulmuş fatura var mı?
    const existing = await this.repo.findOne({ where: { tenantId, saleId } });
    if (existing) {
      throw new BadRequestException(
        `Bu satış için zaten bir e-fatura mevcut: ${existing.id} (${existing.status})`,
      );
    }

    // Satış verilerini çek
    const sale = await this.salesService.findOne(saleId);
    if (!sale) throw new NotFoundException(`Satış bulunamadı: ${saleId}`);

    // UBL satır verilerini hazırla
    const lines: UblInvoiceLine[] = (sale.lines ?? []).map((line: any, i: number) => {
      const qty        = Number(line.quantity ?? 1);
      const unitPrice  = Number(line.unitPrice ?? line.price ?? 0);
      const taxPct     = Number(line.taxPercent ?? 20);
      const lineExt    = parseFloat((qty * unitPrice).toFixed(2));
      const taxAmount  = parseFloat((lineExt * taxPct / 100).toFixed(2));

      return {
        lineNo: i + 1,
        description: line.productVariant?.name ?? line.productPackage?.name ?? `Ürün ${i + 1}`,
        quantity: qty,
        unitCode: 'C62', // GİB adet kodu
        unitPrice,
        taxPercent: taxPct,
        lineExtensionAmount: lineExt,
        taxAmount,
      };
    });

    const taxExclusive = lines.reduce((s, l) => s + l.lineExtensionAmount, 0);
    const taxTotal     = lines.reduce((s, l) => s + l.taxAmount, 0);
    const taxInclusive = parseFloat((taxExclusive + taxTotal).toFixed(2));

    const now = new Date();
    const gibUuid = uuidv4();

    const ublData: UblInvoiceData = {
      uuid: gibUuid,
      documentNo: dto.documentNo,
      issueDate: now.toISOString().slice(0, 10),
      issueTime: now.toTimeString().slice(0, 8),
      invoiceTypeCode: 'SATIS',
      currency: dto.type === EInvoiceType.EARCHIVE ? 'TRY' : (sale.currency ?? 'TRY'),
      issuerVkn: dto.issuerVkn,
      issuerName: sale.store?.name ?? 'Mağaza',
      receiverVkn: dto.receiverVkn,
      receiverTckn: dto.receiverTckn,
      receiverName: dto.receiverName ?? sale.customer?.name ?? 'Perakende Müşteri',
      lines,
      taxExclusiveAmount: taxExclusive,
      taxInclusiveAmount: taxInclusive,
      taxTotalAmount: taxTotal,
    };

    const xmlContent = this.xmlBuilder.build(ublData);

    const invoice = this.repo.create({
      tenantId,
      saleId,
      type: dto.type,
      status: EInvoiceStatus.DRAFT,
      gibUuid,
      documentNo: dto.documentNo,
      issuerVkn: dto.issuerVkn,
      receiverVkn: dto.receiverVkn,
      receiverTckn: dto.receiverTckn,
      receiverName: ublData.receiverName,
      totalAmount: taxInclusive,
      currency: ublData.currency,
      xmlContent,
      createdById: userId,
      updatedById: userId,
    });

    return this.repo.save(invoice);
  }

  /** Mevcut bir DRAFT faturayı GİB'e iletir */
  async submit(id: string): Promise<EInvoice> {
    const invoice = await this.findOrThrow(id);

    if (invoice.status !== EInvoiceStatus.DRAFT) {
      throw new BadRequestException(
        `Yalnızca DRAFT durumundaki faturalar iletilebilir (mevcut: ${invoice.status}).`,
      );
    }

    if (!invoice.xmlContent) {
      throw new BadRequestException('XML içeriği eksik — fatura yeniden oluşturulmalı.');
    }

    // İmzalama (gerçek ortamda HSM'e gider)
    const signedXml = this.gibProvider.signXml(invoice.xmlContent);
    const result = await this.gibProvider.submit(signedXml, invoice.gibUuid);

    invoice.xmlContent  = signedXml;
    invoice.gibResponse = result.rawResponse;
    invoice.updatedById = this.userId();

    if (result.success) {
      invoice.status      = EInvoiceStatus.SUBMITTED;
      invoice.submittedAt = new Date();
    } else {
      invoice.status       = EInvoiceStatus.REJECTED;
      invoice.rejectedAt   = new Date();
      invoice.errorMessage = result.errorMessage;
    }

    return this.repo.save(invoice);
  }

  /** GİB'den fatura durumunu sorgular ve kaydı günceller */
  async queryStatus(id: string): Promise<EInvoice> {
    const invoice = await this.findOrThrow(id);

    if (invoice.status !== EInvoiceStatus.SUBMITTED) {
      return invoice; // Gönderilmemiş faturayı sorgulamaya gerek yok
    }

    const result = await this.gibProvider.query(invoice.gibUuid);
    invoice.updatedById = this.userId();

    switch (result.status) {
      case 'ACCEPTED':
        invoice.status     = EInvoiceStatus.ACCEPTED;
        invoice.acceptedAt = new Date();
        break;
      case 'REJECTED':
        invoice.status       = EInvoiceStatus.REJECTED;
        invoice.rejectedAt   = new Date();
        invoice.errorMessage = result.details;
        break;
      default:
        // PENDING veya NOT_FOUND — durum değişmez
        break;
    }

    invoice.gibResponse = result.details;
    return this.repo.save(invoice);
  }

  /** Fatura iptal talebi gönderir */
  async cancel(id: string, reason: string): Promise<EInvoice> {
    const invoice = await this.findOrThrow(id);

    if (invoice.status === EInvoiceStatus.CANCELLED) {
      throw new BadRequestException('Fatura zaten iptal edilmiş.');
    }
    if (invoice.status === EInvoiceStatus.DRAFT) {
      // DRAFT → doğrudan local iptal (GİB'e gönderilmedi)
      invoice.status      = EInvoiceStatus.CANCELLED;
      invoice.cancelledAt = new Date();
      invoice.updatedById = this.userId();
      return this.repo.save(invoice);
    }

    const result = await this.gibProvider.cancel(invoice.gibUuid, reason);
    invoice.gibResponse = result.rawResponse;
    invoice.updatedById = this.userId();

    if (result.success) {
      invoice.status      = EInvoiceStatus.CANCELLED;
      invoice.cancelledAt = new Date();
    } else {
      invoice.errorMessage = result.errorMessage;
    }

    return this.repo.save(invoice);
  }

  async list(query: ListEInvoicesQueryDto): Promise<EInvoice[]> {
    const tenantId = this.tenantId();
    const qb = this.repo
      .createQueryBuilder('i')
      .where('i.tenantId = :tenantId', { tenantId })
      .orderBy('i.createdAt', 'DESC');

    if (query.status) qb.andWhere('i.status = :status', { status: query.status });
    if (query.type)   qb.andWhere('i.type = :type',     { type: query.type });

    return qb.getMany();
  }

  async get(id: string): Promise<EInvoice> {
    return this.findOrThrow(id);
  }
}
