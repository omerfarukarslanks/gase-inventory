import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';

import { AppContextService } from '../common/context/app-context.service';
import { Sale } from '../sales/sale.entity';
import { SaleStatus } from '../sales/sale.entity';
import { Store } from 'src/store/store.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { StoreErrors } from 'src/common/errors/store.errors';
import { ReportsErrors } from 'src/common/errors/report.errors';
import { StoreVariantStock } from 'src/inventory/store-variant-stock.entity';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(StoreVariantStock)
    private readonly stockSummaryRepo: Repository<StoreVariantStock>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly appContext: AppContextService,
  ) {}

  private async ensureStoreOfTenant(storeId: string): Promise<Store> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const store = await this.storeRepo.findOne({
      where: { id: storeId, tenant: { id: tenantId } },
    });

    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_FOUND);
    }

    return store;
  }

  // 1) Mağaza bazlı stok özeti
  async getStoreStockSummary(storeId: string) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    await this.ensureStoreOfTenant(storeId);

    // variant bazlı stok toplamı
    const rows = await this.stockSummaryRepo
      .createQueryBuilder('s')
      .select('s.productVariantId', 'productVariantId')
      .addSelect('s.quantity', 'quantity')
      .where('s.tenantId = :tenantId', { tenantId })
      .andWhere('s.storeId = :storeId', { storeId })
      .getRawMany<{ productVariantId: string; quantity: string }>();

    if (rows.length === 0) return [];

    // variant isimlerini de çekelim
    const variantIds = rows.map((r) => r.productVariantId);
    const variants = await this.variantRepo.find({
      where: { id: In(variantIds) },
      relations: ['product'],
    });

    const variantMap = new Map(
      variants.map((v) => [v.id, v]),
    );

    return rows.map((r) => {
      const v = variantMap.get(r.productVariantId);
      return {
        productVariantId: r.productVariantId,
        quantity: Number(r.quantity),
        variantName: v?.name,
        productId: v?.product?.id,
        productName: v?.product?.name,
      };
    });
  }

  // 2) Mağaza satış özeti (tarih aralığı)
  async getStoreSalesSummary(params: {
    storeId: string;
    startDate: string; // ISO yyyy-mm-dd
    endDate: string;   // ISO yyyy-mm-dd
  }) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const store = await this.ensureStoreOfTenant(params.storeId);

    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    // end'i gün sonuna çekmek istersen biraz oynayabilirsin

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      throw new BadRequestException(ReportsErrors.INVALID_DATE_RANGE);
    }

    const sales = await this.saleRepo.find({
      where: {
        tenant: { id: tenantId },
        store: { id: store.id },
        status: SaleStatus.CONFIRMED,
        createdAt: Between(start, end),
      },
      relations: ['lines', 'lines.productVariant', 'lines.productVariant.product'],
    });

    let totalNet = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let totalGross = 0;

    // Ürün bazlı satış özetini de çıkaralım (optional ama çok kullanışlı)
    const variantSummary = new Map<
      string,
      {
        productVariantId: string;
        productId?: string;
        productName?: string;
        variantName?: string;
        quantity: number;
        net: number;
        discount: number;
        tax: number;
        gross: number;
      }
    >();

    for (const sale of sales) {
      totalNet += Number(sale.totalNet);
      totalDiscount += Number(sale.totalDiscount);
      totalTax += Number(sale.totalTax);
      totalGross += Number(sale.totalGross);

      for (const line of sale.lines) {
        const key = line.productVariant.id;
        const entry =
          variantSummary.get(key) ??
          {
            productVariantId: key,
            productId: line.productVariant.product?.id,
            productName: line.productVariant.product?.name,
            variantName: line.productVariant.name,
            quantity: 0,
            net: 0,
            discount: 0,
            tax: 0,
            gross: 0,
          };

        const net = (line.unitPrice ?? 0) * line.quantity;
        const discount = line.discountAmount ?? 0;
        const tax = line.taxAmount ?? 0;
        const gross =
          line.lineTotal ??
          net - discount + tax;

        entry.quantity += line.quantity;
        entry.net += net;
        entry.discount += discount;
        entry.tax += tax;
        entry.gross += gross;

        variantSummary.set(key, entry);
      }
    }

    return {
      storeId: store.id,
      storeName: store.name,
      period: {
        start: params.startDate,
        end: params.endDate,
      },
      totals: {
        totalNet,
        totalDiscount,
        totalTax,
        totalGross,
      },
      byVariant: Array.from(variantSummary.values()),
    };
  }
}
