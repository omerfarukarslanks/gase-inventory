import {
  Column,
  Entity,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { Tenant } from 'src/tenant/tenant.entity';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { ProductPackageItem } from './product-package-item.entity';

@Entity({ name: 'product_packages' })
@Unique(['tenant', 'code'])
export class ProductPackage extends AuditableEntity {
  @ManyToOne(() => Tenant, { eager: true })
  tenant: Tenant;

  @Column()
  name: string;

  @Column({ nullable: true })
  code?: string;

  @Column({ nullable: true })
  description?: string;

  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  defaultSalePrice?: number | null;

  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  defaultPurchasePrice?: number | null;

  @Column('numeric', { precision: 5, scale: 2, nullable: true })
  defaultTaxPercent?: number | null;

  @Column('numeric', { precision: 5, scale: 2, nullable: true })
  defaultDiscountPercent?: number | null;

  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  defaultDiscountAmount?: number | null;

  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  defaultTaxAmount?: number | null;

  @Column('numeric', { precision: 12, scale: 2, nullable: true })
  defaultLineTotal?: number | null;

  @Column({ length: 3, default: 'TRY' })
  defaultCurrency: string;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ProductPackageItem, (item) => item.productPackage, {
    cascade: true,
    eager: true,
  })
  items: ProductPackageItem[];
}
