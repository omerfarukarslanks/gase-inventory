import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Location } from './location.entity';

export enum PutawayTaskStatus {
  PENDING     = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED   = 'COMPLETED',
  CANCELLED   = 'CANCELLED',
}

/**
 * Mal kabul sonrası oluşturulan yerleştirme görevidir.
 * Ürünü teslim alma noktasından depo lokasyonuna taşımayı temsil eder.
 */
@Entity({ name: 'warehouse_putaway_tasks' })
@Index('idx_putaway_tenant_status', ['tenant', 'status'])
@Index('idx_putaway_tenant_warehouse', ['tenant', 'warehouseId'])
export class PutawayTask extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  /** Görevin ait olduğu depo (cross-module FK yerine UUID) */
  @Index()
  @Column({ type: 'uuid' })
  warehouseId: string;

  /** Yerleştirilecek ürün varyantı (cross-module FK yerine UUID) */
  @Index()
  @Column({ type: 'uuid' })
  productVariantId: string;

  /** Yerleştirilecek miktar */
  @Column({ type: 'numeric' })
  quantity: number;

  /** Hedef lokasyon */
  @ManyToOne(() => Location, { nullable: false, eager: true })
  toLocation: Location;

  @Column({ type: 'enum', enum: PutawayTaskStatus, default: PutawayTaskStatus.PENDING })
  status: PutawayTaskStatus;

  /**
   * Bu görevi tetikleyen mal kabul belgesi ID (cross-module UUID).
   * Procurement GoodsReceipt'ten gelir.
   */
  @Column({ type: 'uuid', nullable: true })
  goodsReceiptId?: string;

  /** Bu görevi tetikleyen mal kabul satırı ID (opsiyonel, line-level traceability) */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  goodsReceiptLineId?: string;

  /** Göreve atanan kullanıcı (cross-module UUID) */
  @Column({ type: 'uuid', nullable: true })
  assignedToUserId?: string;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
