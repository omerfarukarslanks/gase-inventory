import {
  Column,
  Entity,
  ManyToOne,
  RelationId,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { ProductPackage } from './product-package.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { Product } from 'src/product/product.entity';

@Entity({ name: 'product_package_items' })
export class ProductPackageItem extends AuditableEntity {
  @ManyToOne(() => ProductPackage, (pkg) => pkg.items, {
    onDelete: 'CASCADE',
  })
  productPackage: ProductPackage;

  @ManyToOne(() => ProductVariant, { eager: true, onDelete: 'RESTRICT' })
  productVariant: ProductVariant;

  @ManyToOne(() => Product, { onDelete: 'RESTRICT', nullable: false })
  product: Product;

  @RelationId((item: ProductPackageItem) => item.product)
  productId?: string;

  /**
   * Her paket biriminde bu variantten kaç adet bulunur.
   * Örnek: koli içinde 10 çikolata → quantity = 10
   */
  @Column({ type: 'integer' })
  quantity: number;

  /**
   * Bu variantin paket içindeki birim fiyat katkısı.
   * Kısmi iade senaryosunda otomatik refundAmount hesabı için kullanılır.
   * Örnek: S beden kazak = 100 TL → 1 adet S iadesi = 100 TL refund
   */
  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  unitPrice?: number | null;
}
