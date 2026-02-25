import {
  Column,
  Entity,
  ManyToOne,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { ProductPackage } from './product-package.entity';
import { ProductVariant } from 'src/product/product-variant.entity';

@Entity({ name: 'product_package_items' })
export class ProductPackageItem extends AuditableEntity {
  @ManyToOne(() => ProductPackage, (pkg) => pkg.items, {
    onDelete: 'CASCADE',
  })
  productPackage: ProductPackage;

  @ManyToOne(() => ProductVariant, { eager: true, onDelete: 'RESTRICT' })
  productVariant: ProductVariant;

  /**
   * Her paket biriminde bu variantten kaç adet bulunur.
   * Örnek: koli içinde 10 çikolata → quantity = 10
   */
  @Column({ type: 'integer' })
  quantity: number;
}
