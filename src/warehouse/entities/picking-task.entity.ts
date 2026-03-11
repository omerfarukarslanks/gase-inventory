import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Location } from './location.entity';
import { Wave } from './wave.entity';

export enum PickingTaskStatus {
  PENDING     = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED   = 'COMPLETED',
  CANCELLED   = 'CANCELLED',
  SHORT_PICK  = 'SHORT_PICK',  // Stok yetmedi, kısmen toplandı
}

/**
 * Depo lokasyonundan ürün toplama görevidir.
 * Satış karşılama veya transfer hazırlama için oluşturulur.
 */
@Entity({ name: 'warehouse_picking_tasks' })
@Index('idx_picking_tenant_status', ['tenant', 'status'])
@Index('idx_picking_tenant_wave', ['tenant', 'wave'])
export class PickingTask extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  @Index()
  @Column({ type: 'uuid' })
  warehouseId: string;

  /** Toplanacak ürün varyantı (cross-module UUID) */
  @Index()
  @Column({ type: 'uuid' })
  productVariantId: string;

  /** İstenen miktar */
  @Column({ type: 'numeric' })
  requestedQuantity: number;

  /** Fiilen toplanan miktar (tamamlanınca dolar) */
  @Column({ type: 'numeric', nullable: true })
  pickedQuantity?: number;

  /** Toplama yapılacak kaynak lokasyon */
  @ManyToOne(() => Location, { nullable: false, eager: true })
  fromLocation: Location;

  @Column({ type: 'enum', enum: PickingTaskStatus, default: PickingTaskStatus.PENDING })
  status: PickingTaskStatus;

  /** Bu görevi tetikleyen satış ID (cross-module UUID) */
  @Column({ type: 'uuid', nullable: true })
  saleId?: string;

  /** Bağlı wave (opsiyonel — wave bazlı batch picking) */
  @ManyToOne(() => Wave, { nullable: true, eager: true, onDelete: 'SET NULL' })
  wave?: Wave;

  /** Göreve atanan kullanıcı (cross-module UUID) */
  @Column({ type: 'uuid', nullable: true })
  assignedToUserId?: string;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
