import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Store } from 'src/store/store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { SaleLine } from './sale-line.entity';

export enum SaleStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'sales' })
@Index(['tenant', 'store', 'createdAt'])
@Index('ux_sales_tenant_receipt_no', ['tenant', 'receiptNo'], { unique: true })
export class Sale extends AuditableEntity {
  @ManyToOne(() => Tenant, { eager: true })
  tenant: Tenant;

  @ManyToOne(() => Store, { eager: true })
  store: Store;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.CONFIRMED })
  status: SaleStatus;

  @Column({ type: 'varchar', nullable: true })
  receiptNo?: string | null;

  // Müşteri bilgileri (çok basit)
  @Column({ nullable: true })
  name?: string;

  @Column({ nullable: true })
  surname?: string;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, any>;

  // Toplamlar
  @Column({ type: 'numeric', default: 0 })
  unitPrice: number;

  @Column({ type: 'numeric', default: 0 })
  lineTotal: number;

  @OneToMany(() => SaleLine, (line) => line.sale, { cascade: true })
  lines: SaleLine[];

  
  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  cancelledById?: string | null;
}
