import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Customer } from 'src/customer/customer.entity';
import { Store } from 'src/store/store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  RelationId,
} from 'typeorm';
import { SaleLine } from './sale-line.entity';
import { SalePayment } from './sale-payment.entity';

export enum SaleStatus {
  DRAFT = 'DRAFT',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
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

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string | null;

  @ManyToOne(() => Customer, { nullable: true, eager: false, onDelete: 'SET NULL' })
  customer?: Customer | null;

  @RelationId((sale: Sale) => sale.customer)
  customerId?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, any>;

  // Toplamlar
  @Column({ type: 'numeric', default: 0 })
  unitPrice: number;

  @Column({ type: 'numeric', default: 0 })
  lineTotal: number;

  // Ödeme takibi
  @Column({ type: 'numeric', default: 0 })
  paidAmount: number;

  @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.UNPAID })
  paymentStatus: PaymentStatus;

  get remainingAmount(): number {
    return Math.max(0, Number(this.lineTotal || 0) - Number(this.paidAmount || 0));
  }

  @OneToMany(() => SaleLine, (line) => line.sale, { cascade: true })
  lines: SaleLine[];

  @OneToMany(() => SalePayment, (payment) => payment.sale)
  payments: SalePayment[];

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  cancelledById?: string | null;
}
