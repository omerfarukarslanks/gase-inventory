import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { ReplenishmentRule } from './replenishment-rule.entity';

export enum SuggestionStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DISMISSED = 'DISMISSED',
}

@Entity({ name: 'replenishment_suggestions' })
@Index('idx_replenishment_suggestion_tenant_status', ['tenant', 'status'])
export class ReplenishmentSuggestion extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  @ManyToOne(() => ReplenishmentRule, (r) => r.suggestions, {
    nullable: false,
    eager: true,
    onDelete: 'CASCADE',
  })
  rule: ReplenishmentRule;

  @Column({
    type: 'enum',
    enum: SuggestionStatus,
    default: SuggestionStatus.PENDING,
  })
  status: SuggestionStatus;

  /** Önerilen sipariş miktarı (öneri anında hesaplandı) */
  @Column({ type: 'numeric' })
  suggestedQuantity: number;

  /** Öneri oluşturulduğundaki stok snapshot'ı */
  @Column({ type: 'numeric' })
  currentQuantity: number;

  /** Öneri onaylandığında oluşturulan PO'nun ID'si */
  @Column({ type: 'uuid', nullable: true })
  autoCreatedPoId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
