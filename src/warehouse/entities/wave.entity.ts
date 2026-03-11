import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';

export enum WaveStatus {
  OPEN        = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED   = 'COMPLETED',
  CANCELLED   = 'CANCELLED',
}

/**
 * Wave (dalga), birden fazla toplama görevini gruplar.
 * Toplu sipariş karşılama (batch picking) için kullanılır.
 */
@Entity({ name: 'warehouse_waves' })
@Index('idx_wave_tenant_status', ['tenant', 'status'])
@Index('idx_wave_tenant_warehouse', ['tenant', 'warehouseId'])
export class Wave extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  @Index()
  @Column({ type: 'uuid' })
  warehouseId: string;

  /** Kısa tanımlayıcı — örn. "WAVE-20260311-001" */
  @Column({ length: 100 })
  code: string;

  @Column({ type: 'enum', enum: WaveStatus, default: WaveStatus.OPEN })
  status: WaveStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
