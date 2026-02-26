import { Tenant } from 'src/tenant/tenant.entity';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  RelationId,
  Unique,
} from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';

@Entity({ name: 'product_categories' })
@Unique(['tenant', 'slug'])
@Index('idx_product_category_tenant_parent', ['tenant', 'parent'])
export class ProductCategory extends AuditableEntity {
  @ManyToOne(() => Tenant, { eager: false, onDelete: 'CASCADE' })
  tenant: Tenant;

  @RelationId((c: ProductCategory) => c.tenant)
  tenantId: string;

  @Column()
  name: string;

  @Column({ nullable: true })
  slug?: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ default: true })
  isActive: boolean;

  /** Üst kategori — null ise kök kategoridir */
  @ManyToOne(() => ProductCategory, (c) => c.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  parent?: ProductCategory | null;

  @RelationId((c: ProductCategory) => c.parent)
  parentId?: string | null;

  @OneToMany(() => ProductCategory, (c) => c.parent)
  children?: ProductCategory[];
}
