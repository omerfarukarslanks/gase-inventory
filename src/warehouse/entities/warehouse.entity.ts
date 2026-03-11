import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';

@Entity({ name: 'warehouses' })
@Index('idx_warehouse_tenant', ['tenant'])
export class Warehouse extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  /** Bu deponun bağlı olduğu mağaza (cross-module FK yerine UUID) */
  @Index()
  @Column({ type: 'uuid' })
  storeId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ default: true })
  isActive: boolean;
}
