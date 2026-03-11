import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Kritik işlemlerin değişmez kayıt defteri.
 * AuditableEntity'yi extend etmez — sadece createdAt vardır, updatedAt yoktur.
 */
@Entity({ name: 'audit_logs' })
@Index('idx_audit_log_tenant_entity', ['tenantId', 'entityType', 'entityId'])
@Index('idx_audit_log_tenant_actor', ['tenantId', 'userId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  /** İşlemi gerçekleştiren kullanıcı (sistem cron ise null) */
  @Column({ type: 'uuid', nullable: true })
  userId?: string;

  /** İşlem kodu — örn: PO_APPROVED, PO_CANCELLED, PO_RECEIPT_CREATED */
  @Column({ length: 100 })
  action: string;

  /** Hangi entity türü — örn: PurchaseOrder, GoodsReceipt */
  @Column({ length: 100 })
  entityType: string;

  /** Entity'nin UUID'si */
  @Column({ type: 'uuid' })
  entityId: string;

  /** Önceki → sonraki durum veya değişen alanlar */
  @Column({ type: 'jsonb', nullable: true })
  diff?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
