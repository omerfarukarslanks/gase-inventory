import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AiActionType {
  /** Düşük stoklu ürün için Draft PO oluştur */
  CREATE_PO_DRAFT    = 'CREATE_PO_DRAFT',
  /** Fiyat düzeltme onay talebi oluştur */
  PRICE_ADJUSTMENT   = 'PRICE_ADJUSTMENT',
  /** Stok düzeltme onay talebi oluştur */
  STOCK_ADJUSTMENT   = 'STOCK_ADJUSTMENT',
  /**
   * Talep tahmini — reorder_analysis + seasonality verilerinden üretilir.
   * Kullanıcı onayı: Replenishment rule güncelleme / PO tavsiyesi.
   */
  DEMAND_FORECAST    = 'DEMAND_FORECAST',
  /**
   * Anomali uyarısı — haftalık karşılaştırmada ani spike / drop.
   * Kullanıcı onayı: Audit log (incelendi kaydı).
   */
  ANOMALY_ALERT      = 'ANOMALY_ALERT',
}

export enum AiActionStatus {
  PENDING   = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  DISMISSED = 'DISMISSED',
}

/**
 * AI tarafından üretilen eylem önerileri.
 * Her öneri insan onayı olmadan uygulanamaz.
 *
 * Onay akışı:
 *   CREATE_PO_DRAFT   → ProcurementService.createPurchaseOrder() (Draft, onaysız uygulama)
 *   PRICE_ADJUSTMENT  → ApprovalRequest (PRICE_OVERRIDE, L2)
 *   STOCK_ADJUSTMENT  → ApprovalRequest (STOCK_ADJUSTMENT, L1)
 *   DEMAND_FORECAST   → Audit log (bilgi amaçlı — kullanıcı incelendi olarak işaretler)
 *   ANOMALY_ALERT     → Audit log (bilgi amaçlı — kullanıcı incelendi olarak işaretler)
 */
@Entity({ name: 'ai_action_suggestions' })
@Index('idx_ai_action_tenant_status', ['tenantId', 'status'])
export class AiActionSuggestion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'enum', enum: AiActionType })
  actionType: AiActionType;

  @Column({
    type: 'enum',
    enum: AiActionStatus,
    default: AiActionStatus.PENDING,
  })
  status: AiActionStatus;

  /**
   * AI'ın önerdiği işlemi uygulamak için gereken parametreler.
   * actionType'a göre içerik değişir:
   * - CREATE_PO_DRAFT: { storeId, supplierId?, lines: [{productVariantId, quantity}] }
   * - PRICE_ADJUSTMENT: { storeId, productVariantId, newPrice, currency? }
   * - STOCK_ADJUSTMENT: { storeId, productVariantId, newQuantity }
   */
  @Column({ type: 'jsonb' })
  suggestedData: Record<string, any>;

  /** AI'ın bu öneriyi neden yaptığına dair açıklama */
  @Column({ type: 'text' })
  rationale: string;

  /** Onaylayan kullanıcı UUID */
  @Column({ type: 'uuid', nullable: true })
  confirmedById?: string;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt?: Date;

  /** Onay akışında oluşturulan ApprovalRequest ID (fiyat/stok düzeltme için) */
  @Column({ type: 'uuid', nullable: true })
  approvalRequestId?: string;

  /** Onay akışında oluşturulan PO ID (CREATE_PO_DRAFT için) */
  @Column({ type: 'uuid', nullable: true })
  createdPoId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
