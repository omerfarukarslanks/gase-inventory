import { Tenant } from 'src/tenant/tenant.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { ProductVariant } from './product-variant.entity';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';

@Entity({ name: 'products' })
@Unique(['tenant', 'sku'])   // aynı tenant içinde sku unique
@Unique(['tenant', 'name'])  // istersen name'i de unique yapabilirsin
export class Product extends AuditableEntity {

  @ManyToOne(() => Tenant, (tenant) => tenant.id, { eager: true })
  tenant: Tenant;

  @Column()
  name: string;

  @Column({ nullable: true })
  sku?: string; // internal code

  @Column({ nullable: true })
  description?: string;

  @Column({ nullable: true })
  defaultBarcode?: string; // varyant kullanmayan ürünler için

  @Column({ nullable: true })
  image?: string;

  // 🔹 Fiyat alanları
  @Column({ type: 'varchar', length: 3, default: 'TRY' })
  defaultCurrency: string;

  @Column({ type: 'numeric', nullable: true })
  defaultSalePrice?: number; // KDV hariç veya dahil – projede nasıl karar verirsek

  @Column({ type: 'numeric', nullable: true })
  defaultPurchasePrice?: number; // tedarik alış fiyatı (opsiyonel)

  @Column({ type: 'numeric', nullable: true })
  defaultTaxPercent?: number; // ör: 20 => %20 KDV

  /* @Column({ nullable: true })
  additionalImages?: string[]; */

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ProductVariant, (variant) => variant.product)
  variants: ProductVariant[];
}
