import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Store } from 'src/store/store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import {
  Column,
  Entity,
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
export class Sale extends AuditableEntity {
  @ManyToOne(() => Tenant, { eager: true })
  tenant: Tenant;

  @ManyToOne(() => Store, { eager: true })
  store: Store;

  @Column({ type: 'enum', enum: SaleStatus, default: SaleStatus.CONFIRMED })
  status: SaleStatus;

  // Müşteri bilgileri (çok basit)
  @Column({ nullable: true })
  customerName?: string;

  @Column({ nullable: true })
  customerPhone?: string;

  @Column({ nullable: true })
  customerEmail?: string;

  @Column({ nullable: true })
  note?: string;

  // Toplamlar
  @Column({ type: 'numeric', default: 0 })
  totalNet: number;

  @Column({ type: 'numeric', default: 0 })
  totalDiscount: number;

  @Column({ type: 'numeric', default: 0 })
  totalTax: number;

  @Column({ type: 'numeric', default: 0 })
  totalGross: number; // nihai toplam

  @OneToMany(() => SaleLine, (line) => line.sale, { cascade: true })
  lines: SaleLine[];

  
  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  cancelledById?: string | null;
}
