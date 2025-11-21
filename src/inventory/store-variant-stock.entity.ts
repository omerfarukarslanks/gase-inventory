import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { Store } from 'src/store/store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Column, Entity, Index, ManyToOne } from 'typeorm';

@Entity({ name: 'store_variant_stock' })
@Index('ux_store_variant_stock_tenant_store_variant', [
  'tenant',
  'store',
  'productVariant',
], {
  unique: true,
})
@Index('idx_store_variant_stock_tenant_variant', ['tenant', 'productVariant'])
export class StoreVariantStock extends AuditableEntity {
  @ManyToOne(() => Tenant)
  tenant: Tenant;

  @ManyToOne(() => Store)
  store: Store;

  @ManyToOne(() => ProductVariant)
  productVariant: ProductVariant;

  @Column({ type: 'numeric', default: 0 })
  quantity: number;
}
