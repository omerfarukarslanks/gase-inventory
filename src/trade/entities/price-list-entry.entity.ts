import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { CustomerGroup } from './customer-group.entity';

/**
 * Toptan / grup fiyat listesi satırı.
 * Belirli bir müşteri grubuna, belirli bir ürün varyantı için
 * özel satış fiyatı tanımlar.
 *
 * Fiyat çözümleme önceliği (satış sırasında):
 * 1. PriceListEntry (müşteri grubuna özel)
 * 2. StoreProductPrice (mağazaya özel)
 * 3. ProductVariant.defaultSalePrice (genel varsayılan)
 */
@Entity({ name: 'price_list_entries' })
@Index('idx_price_list_group_variant', ['customerGroup', 'productVariantId'], { unique: true })
export class PriceListEntry extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  @ManyToOne(() => CustomerGroup, { nullable: false, eager: true, onDelete: 'CASCADE' })
  customerGroup: CustomerGroup;

  /** Ürün varyant ID (cross-module: plain UUID) */
  @Index()
  @Column({ type: 'uuid' })
  productVariantId: string;

  /** Müşteri grubuna uygulanan satış fiyatı */
  @Column({ type: 'numeric' })
  price: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  /** Geçerlilik başlangıcı — NULL ise hemen geçerli */
  @Column({ type: 'timestamptz', nullable: true })
  validFrom?: Date;

  /** Geçerlilik bitişi — NULL ise süresiz */
  @Column({ type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({ default: true })
  isActive: boolean;
}
