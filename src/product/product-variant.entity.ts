import {
  Column,
  Entity,
  ManyToOne,
  Unique,
} from 'typeorm';
import { Product } from './product.entity';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';

@Entity({ name: 'product_variants' })
@Unique(['product', 'code'])
@Unique(['barcode'])
export class ProductVariant extends AuditableEntity {
  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
  })
  product: Product;

  @Column()
  name: string; // ör: "Kırmızı / M"

  @Column()
  code: string; // varyant kodu (RENK-BEDEN vs.)

  @Column({ nullable: true })
  barcode?: string;

  // İleride: renk, beden vb. attribute'leri buraya jsonb ile taşıyabiliriz
  @Column({ type: 'jsonb', nullable: true })
  attributes?: Record<string, any>;

  // Tenant default fiyat (satış)
  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  defaultSalePrice?: number | null;

  // Tenant default alış fiyatı (opsiyonel)
  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  defaultPurchasePrice?: number | null;

  @Column({ length: 3, default: 'TRY' })
  defaultCurrency: string;

  @Column('numeric', { precision: 5, scale: 2, nullable: true })
  defaultTaxPercent?: number | null;

  @Column({ default: true })
  isActive: boolean;
}
