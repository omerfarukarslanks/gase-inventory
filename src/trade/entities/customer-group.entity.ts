import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';

/**
 * Müşteri grubu — toptan fiyat listeleri ve ödeme vadesi
 * bu grup üzerinden tanımlanır.
 * Örn: "Toptan", "VIP", "Perakende"
 */
@Entity({ name: 'customer_groups' })
@Index('idx_customer_group_tenant', ['tenant'])
export class CustomerGroup extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  @Column({ length: 100 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: true })
  isActive: boolean;
}
