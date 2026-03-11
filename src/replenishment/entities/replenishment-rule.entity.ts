import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { ReplenishmentSuggestion } from './replenishment-suggestion.entity';

@Entity({ name: 'replenishment_rules' })
@Index('idx_replenishment_rule_tenant_store_variant', ['tenant', 'storeId', 'productVariantId'])
export class ReplenishmentRule extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  /** Mağaza referansı — cross-module UUID, FK yok */
  @Index()
  @Column({ type: 'uuid' })
  storeId: string;

  /** Ürün varyantı referansı — cross-module UUID, FK yok */
  @Index()
  @Column({ type: 'uuid' })
  productVariantId: string;

  /** Bu miktarın altına düşünce öneri üret */
  @Column({ type: 'numeric' })
  minStock: number;

  /** Hedef stok: önerilen sipariş miktarı = targetStock - currentQty */
  @Column({ type: 'numeric' })
  targetStock: number;

  /** Tedarikçi ID — PO oluştururken kullanılır (opsiyonel) */
  @Column({ type: 'uuid', nullable: true })
  supplierId?: string;

  /** Temin süresi (gün) — bilgi amaçlı */
  @Column({ type: 'int', nullable: true })
  leadTimeDays?: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => ReplenishmentSuggestion, (s) => s.rule)
  suggestions: ReplenishmentSuggestion[];
}
