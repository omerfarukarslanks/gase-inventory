import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';

/**
 * Müşteri kredi limiti.
 * Müşteri başına yalnızca bir aktif limit kaydı olmalıdır.
 *
 * usedAmount takibi: satışlar üzerinden gerçek zamanlı hesaplanır,
 * bu tabloda opsiyonel cache olarak tutulabilir (Faz 3).
 */
@Entity({ name: 'customer_credit_limits' })
@Index('idx_credit_limit_tenant_customer', ['tenant', 'customerId'], { unique: true })
export class CustomerCreditLimit extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  /** Müşteri ID (cross-module: plain UUID, FK yok) */
  @Index()
  @Column({ type: 'uuid' })
  customerId: string;

  /** Maksimum açık hesap tutarı */
  @Column({ type: 'numeric' })
  creditLimit: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  /** Uyarı eşiği — limitin bu yüzdesine ulaşınca uyarı üret (opsiyonel) */
  @Column({ type: 'numeric', nullable: true })
  warningThresholdPercent?: number;

  @Column({ default: true })
  isActive: boolean;
}
