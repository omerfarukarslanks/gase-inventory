import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { Sale, SaleStatus } from './sale.entity';
import { SaleLine } from './sale-line.entity';
import { CreateSaleDto } from './dto/create-sale.dto';
import { AppContextService } from '../common/context/app-context.service';
import { InventoryService } from '../inventory/inventory.service';
import { SellStockDto } from '../inventory/dto/sell-stock.dto';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { StoreErrors } from 'src/common/errors/store.errors';
import { ProductErrors } from 'src/common/errors/product.errors';
import { SalesErrors } from 'src/common/errors/sale.errors';
import { calculateLineAmounts } from './utils/price-calculator';
import { PriceService } from 'src/pricing/price.service';
import {
  ListSalesForStoreQueryDto,
  PaginatedSalesResponse,
} from './dto/list-sales.dto';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepo: Repository<SaleLine>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly appContext: AppContextService,
    private readonly inventoryService: InventoryService,
    private readonly priceService: PriceService,
    private readonly dataSource: DataSource,
  ) { }

  private async getTenantStoreOrThrow(storeId: string, manager?: EntityManager): Promise<Store> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const repo = manager ? manager.getRepository(Store) : this.storeRepo;

    const store = await repo.findOne({
      where: { id: storeId, tenant: { id: tenantId } },
      relations: ['tenant'],
    });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    return store;
  }

  private async getTenantVariantOrThrow(
    variantId: string,
    manager?: EntityManager
  ): Promise<ProductVariant> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const repo = manager ? manager.getRepository(ProductVariant) : this.variantRepo;

    const variant = await repo.findOne({
      where: {
        id: variantId,
        product: { tenant: { id: tenantId } },
      },
      relations: ['product', 'product.tenant'],
    });

    if (!variant) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    return variant;
  }

  // ---- Satış oluştur + stok düş ----

  async createSale(dto: CreateSaleDto, manager?: EntityManager): Promise<Sale> {
    // Eğer dışarıdan manager geldiyse mevcut transaction'a katıl,
    // gelmediyse kendi transaction'ını yarat.
    if (manager) {
      return this.createSaleInternal(dto, manager);
    }

    return this.dataSource.transaction((txManager) =>
      this.createSaleInternal(dto, txManager),
    );
  }

  // 🔒 Asıl iş burada, her zaman bir EntityManager ile çalışıyor
  private async createSaleInternal(
    dto: CreateSaleDto,
    manager: EntityManager,
  ): Promise<Sale> {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(SalesErrors.SALE_MUST_HAVE_LINES);
    }

    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const saleRepo = manager.getRepository(Sale);
    const saleLineRepo = manager.getRepository(SaleLine);

    const store = await this.getTenantStoreOrThrow(dto.storeId, manager);

    const variantIds = [...new Set(dto.lines.map((line) => line.productVariantId))];

    const variants = await manager.getRepository(ProductVariant).find({
      where: {
        id: In(variantIds),
        product: { tenant: { id: tenantId } },
      },
      relations: ['product', 'product.tenant'],
    });

    if (variants.length !== variantIds.length) {
      throw new NotFoundException(ProductErrors.VARIANT_NOT_FOUND);
    }

    const variantMap = new Map<string, ProductVariant>(
      variants.map((variant) => [variant.id, variant]),
    );

    const effectivePrices = await this.priceService.getEffectiveSaleParamsForStoreBulk(
      store.id,
      variantIds,
      manager,
    );

    // 1) Sale kaydı
    const sale = saleRepo.create({
      tenant: { id: tenantId } as any,
      store: { id: store.id } as any,
      status: SaleStatus.CONFIRMED,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      customerEmail: dto.customerEmail,
      note: dto.note,
      createdById: userId,
      updatedById: userId,
    });

    const savedSale = await saleRepo.save(sale);

    let totalNet = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let totalGross = 0;

    const saleLines: SaleLine[] = [];

    // 2) Satırları oluştur + stok düş
    for (const lineDto of dto.lines) {
      const variant = variantMap.get(lineDto.productVariantId)!;

      // 🔹 1) PriceService ile mağaza bazlı efektif parametreleri al
      if (lineDto.unitPrice == null) {
        const priceParams = effectivePrices.get(lineDto.productVariantId);

        lineDto.unitPrice = priceParams?.unitPrice ?? 0;

        if (lineDto.taxPercent == null && priceParams?.taxPercent != null) {
          lineDto.taxPercent = priceParams.taxPercent;
        }

        if (
          lineDto.discountPercent == null &&
          priceParams?.discountPercent != null
        ) {
          lineDto.discountPercent = priceParams.discountPercent;
        }

        if (!lineDto.currency && priceParams?.currency) {
          lineDto.currency = priceParams.currency;
        }
      }

      const {
        net,
        discountAmount,
        discountPercent,
        taxAmount,
        taxPercent,
        lineTotal,
      } = calculateLineAmounts({
        quantity: lineDto.quantity,
        unitPrice: lineDto.unitPrice ?? 0,
        discountPercent: lineDto.discountPercent ?? 0,
        discountAmount: lineDto.discountAmount ?? 0,
        taxPercent: lineDto.taxPercent ?? 0,
        taxAmount: lineDto.taxAmount ?? 0,
      });

      const line = saleLineRepo.create({
        sale: { id: savedSale.id } as any,
        productVariant: { id: variant.id } as any,
        quantity: lineDto.quantity,
        currency: lineDto.currency,
        unitPrice: lineDto.unitPrice,
        discountPercent: discountPercent ?? 0,
        discountAmount,
        taxPercent: taxPercent ?? 0,
        taxAmount,
        lineTotal,
        campaignCode: lineDto.campaignCode,
        createdById: userId,
        updatedById: userId,
      });

      const savedLine = await saleLineRepo.save(line);
      saleLines.push(savedLine);

      totalNet += net;
      totalDiscount += discountAmount;
      totalTax += taxAmount;
      totalGross += lineTotal;

      // 3) Stok düş (OUT) – transaction-aware InventoryService
      const sellDto: SellStockDto = {
        storeId: store.id,
        productVariantId: variant.id,
        quantity: lineDto.quantity,
        reference: `SALE-${savedSale.id}`,
        meta: { saleId: savedSale.id, saleLineId: savedLine.id },
        currency: lineDto.currency,
        unitPrice: lineDto.unitPrice,
        discountPercent: discountPercent ?? 0,
        discountAmount,
        taxPercent: taxPercent ?? 0,
        taxAmount,
        lineTotal,
        campaignCode: lineDto.campaignCode,
        saleId: savedSale.id,
        saleLineId: savedLine.id,
      };

      await this.inventoryService.sellFromStore(sellDto, manager);
    }

    // 4) Satış toplamlarını güncelle
    savedSale.totalNet = totalNet;
    savedSale.totalDiscount = totalDiscount;
    savedSale.totalTax = totalTax;
    savedSale.totalGross = totalGross;
    savedSale.updatedById = userId;

    return saleRepo.save(savedSale);
  }



  /**
   * Satış iptali / iadesi:
   * - Sale.status = CANCELLED
   * - Her satır için IN hareketi (stok iadesi)
   */

  async cancelSale(id: string, manager?: EntityManager): Promise<Sale> {
    if (manager) {
      return this.cancelSaleInternal(id, manager);
    }

    return this.dataSource.transaction((txManager) =>
      this.cancelSaleInternal(id, txManager),
    );
  }

  private async cancelSaleInternal(
    id: string,
    manager: EntityManager,
  ): Promise<Sale> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const userId = this.appContext.getUserIdOrThrow();

    const saleRepo = manager.getRepository(Sale);

    const sale = await saleRepo.findOne({
      where: { id, tenant: { id: tenantId } },
      relations: ['store', 'lines', 'lines.productVariant'],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    if (sale.status === SaleStatus.CANCELLED) {
      throw new BadRequestException(SalesErrors.SALE_ALREADY_CANCELLED);
    }

    if (sale.status !== SaleStatus.CONFIRMED) {
      throw new BadRequestException({
        ...SalesErrors.SALE_STATUS_NOT_CONFIRMABLE,
        details: { currentStatus: sale.status },
      });
    }

    // Her satır için iade (IN)
    for (const line of sale.lines) {
      await this.inventoryService.createReturnMovementForSaleLine(
        {
          saleId: sale.id,
          saleLineId: line.id,
          storeId: sale.store.id,
          productVariantId: line.productVariant.id,
          quantity: line.quantity,
          currency: line.currency,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          discountAmount: line.discountAmount,
          taxPercent: line.taxPercent,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          campaignCode: line.campaignCode,
        },
        manager,
      );
    }

    sale.status = SaleStatus.CANCELLED;
    sale.updatedById = userId;
    sale.cancelledById = userId;
    sale.cancelledAt = new Date();

    return saleRepo.save(sale);
  }

  async findOne(id: string, manager?: EntityManager): Promise<Sale> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const repo = manager ? manager.getRepository(Sale) : this.saleRepo;

    const sale = await repo.findOne({
      where: {
        id,
        tenant: { id: tenantId },
      },
      relations: ['store', 'lines', 'lines.productVariant'],
    });

    if (!sale) {
      throw new NotFoundException(SalesErrors.SALE_NOT_FOUND);
    }

    return sale;
  }

  async findAllForStore(
    query: ListSalesForStoreQueryDto,
    manager?: EntityManager,
  ): Promise<PaginatedSalesResponse> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    await this.getTenantStoreOrThrow(query.storeId, manager);

    const repo = manager ? manager.getRepository(Sale) : this.saleRepo;

    const qb = repo
      .createQueryBuilder('sale')
      .leftJoin('sale.store', 'store')
      .select([
        'sale.id',
        'sale.status',
        'sale.totalNet',
        'sale.totalDiscount',
        'sale.totalTax',
        'sale.totalGross',
        'sale.customerName',
        'sale.customerPhone',
        'sale.customerEmail',
        'sale.note',
        'sale.createdAt',
      ])
      .addSelect(['store.id', 'store.name', 'store.code'])
      .where('sale.tenantId = :tenantId', { tenantId })
      .andWhere('sale.storeId = :storeId', { storeId: query.storeId })
      .orderBy('sale.createdAt', 'DESC')
      .skip(query.offset)
      .take(query.limit);

    if (query.includeLines) {
      qb
        .leftJoin('sale.lines', 'line')
        .leftJoin('line.productVariant', 'productVariant')
        .addSelect([
          'line.id',
          'line.quantity',
          'line.currency',
          'line.unitPrice',
          'line.discountPercent',
          'line.discountAmount',
          'line.taxPercent',
          'line.taxAmount',
          'line.lineTotal',
          'line.campaignCode',
        ])
        .addSelect([
          'productVariant.id',
          'productVariant.name',
          'productVariant.code',
          'productVariant.barcode',
        ]);
    }

    const [sales, total] = await qb.getManyAndCount();

    return {
      data: sales,
      meta: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + sales.length < total,
      },
    };
  }
}
