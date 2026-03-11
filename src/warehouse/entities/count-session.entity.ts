import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { CountLine } from './count-line.entity';

export enum CountSessionStatus {
  OPEN        = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  CLOSED      = 'CLOSED',
}

@Entity({ name: 'count_sessions' })
@Index('idx_count_session_tenant_store', ['tenant', 'storeId'])
export class CountSession extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  @Index()
  @Column({ type: 'uuid' })
  storeId: string;

  /** Depo bazlı sayım ise warehouseId dolu olur, mağaza geneli ise NULL */
  @Column({ type: 'uuid', nullable: true })
  warehouseId?: string;

  @Column({
    type: 'enum',
    enum: CountSessionStatus,
    default: CountSessionStatus.OPEN,
  })
  status: CountSessionStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @OneToMany(() => CountLine, (line) => line.session, { cascade: ['insert', 'update'] })
  lines: CountLine[];
}
