import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ApprovalEntityType {
  STOCK_ADJUSTMENT = 'STOCK_ADJUSTMENT',
  PRICE_OVERRIDE   = 'PRICE_OVERRIDE',
}

export enum ApprovalStatus {
  /** L1 onayı bekleniyor */
  PENDING_L1 = 'PENDING_L1',
  /** L1 onaylandı, L2 bekleniyor (dual-level akışlar için) */
  PENDING_L2 = 'PENDING_L2',
  /** Tamamen onaylandı ve işlem uygulandı */
  APPROVED   = 'APPROVED',
  /** Herhangi bir seviyede reddedildi */
  REJECTED   = 'REJECTED',
  /** Talep eden tarafından geri çekildi */
  CANCELLED  = 'CANCELLED',
}

/**
 * Onay talepleri.
 *
 * maxLevel = 1 → tek seviyeli (L1 yeterli)
 * maxLevel = 2 → çift seviyeli (L1 + L2 gerekli)
 *
 * STOCK_ADJUSTMENT: maxLevel = 1
 * PRICE_OVERRIDE:   maxLevel = 2
 */
@Entity({ name: 'approval_requests' })
@Index('idx_approval_tenant_status', ['tenantId', 'status'])
@Index('idx_approval_requested_by', ['tenantId', 'requestedById'])
export class ApprovalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'enum', enum: ApprovalEntityType })
  entityType: ApprovalEntityType;

  /** Güncelleme yapılacak mevcut entity UUID'si (opsiyonel) */
  @Column({ type: 'uuid', nullable: true })
  entityId?: string;

  @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.PENDING_L1 })
  status: ApprovalStatus;

  /** 1 veya 2 — entityType'a göre belirlenir */
  @Column({ type: 'int', default: 1 })
  maxLevel: number;

  /** Talebi oluşturan kullanıcı */
  @Column({ type: 'uuid' })
  requestedById: string;

  /** İşlemi uygulamak için gereken tüm parametreler */
  @Column({ type: 'jsonb' })
  requestData: Record<string, any>;

  /** Talep eden kişinin notu */
  @Column({ type: 'text', nullable: true })
  requesterNotes?: string;

  // ── L1 Onay ───────────────────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  l1ReviewedById?: string;

  @Column({ type: 'timestamptz', nullable: true })
  l1ReviewedAt?: Date;

  @Column({ type: 'text', nullable: true })
  l1ReviewNotes?: string;

  // ── L2 Onay ───────────────────────────────────────────────────────────────

  @Column({ type: 'uuid', nullable: true })
  l2ReviewedById?: string;

  @Column({ type: 'timestamptz', nullable: true })
  l2ReviewedAt?: Date;

  @Column({ type: 'text', nullable: true })
  l2ReviewNotes?: string;

  /** Opsiyonel: bu tarihe kadar onaylanmazsa geçerliliğini yitirir */
  @Column({ type: 'timestamptz', nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
