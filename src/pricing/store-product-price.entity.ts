import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Tenant } from '../tenant/tenant.entity';
import { Store } from '../store/store.entity';
import { ProductVariant } from '../product/product-variant.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

@Entity('store_product_price')
@Unique(['tenant', 'store', 'productVariant'])
export class StoreProductPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  store: Store;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  productVariant: ProductVariant;

  /**
   * Mağazaya özel SATIŞ fiyatı (birim fiyat)
   * null ise -> ProductVariant.defaultSalePrice kullanılır
   */
  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  salePrice?: number | null;

  /**
   * Mağazaya özel alış fiyatı istersen kullanırsın (şimdilik optional)
   */
  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  purchasePrice?: number | null;

  /**
   * Mağazaya özel para birimi. null ise variant.defaultCurrency kullanılır
   */
  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi' })
  @IsOptional()
  @IsIn(['TRY', 'USD', 'EUR'])
  currency?: string | null;

  /**
   * Mağazaya özel vergi yüzdesi (örn. 20.00)
   * null ise -> variant.defaultTaxPercent kullanılır
   */
  @Column('numeric', { precision: 5, scale: 2, nullable: true })
  taxPercent?: number | null;

  /**
   * Mağazaya özel İNDİRİM yüzdesi (örn. 10.00)
   * null ise -> indirim yok / variant default’ı kullanırsın (istersen)
   * Tutar (discountAmount) yine satır bazında quantity * unitPrice’a göre hesaplanacak.
   */
  @Column('numeric', { precision: 5, scale: 2, nullable: true })
  discountPercent?: number | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'now()' })
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  createdById?: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById?: string | null;
}
