import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';

/**
 * Ödeme vadesi tanımı.
 * Müşteri bazında (customerId dolu) veya grup bazında (customerGroupId dolu) olabilir.
 * Her ikisi de NULL ise tenant geneli varsayılan sayılır.
 *
 * Öncelik: müşteri bazlı > grup bazlı > tenant varsayılanı
 *
 * Örn: netDays=30, discountDays=10, discountPercent=2 → "2/10 Net 30"
 * (10 gün içinde öderse %2 iskonto, aksi hâlde 30 gün vadeli)
 */
@Entity({ name: 'payment_terms' })
@Index('idx_payment_term_tenant', ['tenant'])
export class PaymentTerm extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  /** Müşteri bazlı kural — NULL ise grup veya tenant geneli */
  @Column({ type: 'uuid', nullable: true })
  customerId?: string;

  /** Grup bazlı kural — NULL ise müşteri bazlı veya tenant geneli */
  @Column({ type: 'uuid', nullable: true })
  customerGroupId?: string;

  /** Ödeme için gün sayısı — örn. 30 = Net 30 */
  @Column({ type: 'int' })
  netDays: number;

  /** Erken ödeme indirimi için gün penceresi — örn. 10 (2/10 Net 30) */
  @Column({ type: 'int', nullable: true })
  discountDays?: number;

  /** Erken ödeme yapılırsa uygulanacak iskonto yüzdesi */
  @Column({ type: 'numeric', nullable: true })
  discountPercent?: number;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ default: true })
  isActive: boolean;
}
