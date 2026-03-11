import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Warehouse } from './warehouse.entity';

export enum LocationType {
  RACK  = 'RACK',
  BIN   = 'BIN',
  SHELF = 'SHELF',
  ZONE  = 'ZONE',
}

@Entity({ name: 'locations' })
@Index('idx_location_warehouse', ['warehouse'])
@Index('idx_location_tenant_code', ['tenant', 'code'])
export class Location extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  @ManyToOne(() => Warehouse, { nullable: false, eager: true, onDelete: 'CASCADE' })
  warehouse: Warehouse;

  /**
   * Kısa tanımlayıcı kod — örn. "A-01-B1".
   * Tenant + warehouse içinde benzersiz.
   */
  @Column({ length: 50 })
  code: string;

  @Column({ length: 100, nullable: true })
  name?: string;

  @Column({ type: 'enum', enum: LocationType, default: LocationType.BIN })
  type: LocationType;

  @Column({ default: true })
  isActive: boolean;
}
