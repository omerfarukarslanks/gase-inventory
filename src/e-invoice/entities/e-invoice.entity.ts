import { Column, Entity, Index } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';

export enum EInvoiceType {
  EFATURA  = 'EFATURA',   // e-Fatura: kayıtlı mükellef → kayıtlı mükellef
  EARCHIVE = 'EARCHIVE',  // e-Arşiv:  kayıtlı mükellef → herkes (B2C dahil)
}

export enum EInvoiceStatus {
  DRAFT     = 'DRAFT',      // XML oluşturuldu, henüz iletilmedi
  SUBMITTED = 'SUBMITTED',  // GİB'e iletildi, onay bekleniyor
  ACCEPTED  = 'ACCEPTED',   // GİB kabul etti
  REJECTED  = 'REJECTED',   // GİB reddetti
  CANCELLED = 'CANCELLED',  // İptal edildi
}

/**
 * GİB e-Fatura / e-Arşiv fatura kaydı.
 *
 * Her kayıt bir satışa bağlıdır ve GİB'e gönderilecek UBL 2.1 XML'ini
 * ve GİB'den dönen sonucu barındırır.
 *
 * Önemli: XML imzalama (XAdES) gerçek implementasyonda bir imza servisi
 * (HSM / qualified e-signature provider) üzerinden yapılmalıdır.
 */
@Entity({ name: 'e_invoices' })
@Index('idx_einvoice_tenant_status', ['tenantId', 'status'])
@Index('idx_einvoice_sale', ['tenantId', 'saleId'], { unique: true })
export class EInvoice extends AuditableEntity {
  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  /** Faturanın bağlı olduğu satış ID */
  @Index()
  @Column({ type: 'uuid' })
  saleId: string;

  @Column({ type: 'enum', enum: EInvoiceType })
  type: EInvoiceType;

  @Column({
    type: 'enum',
    enum: EInvoiceStatus,
    default: EInvoiceStatus.DRAFT,
  })
  status: EInvoiceStatus;

  /**
   * Fatura UUID'si — GİB tarafından atanır veya gönderim öncesi RFC 4122 UUID v4 ile üretilir.
   * GİB bu UUID ile tekrarlı gönderimleri idempotent olarak işler.
   */
  @Column({ type: 'uuid', unique: true })
  gibUuid: string;

  /** Belge seri/sıra numarası — örn. "GBS2026000000001" */
  @Column({ length: 30 })
  documentNo: string;

  /** Faturayı düzenleyen vergi kimlik numarası (10 hane) */
  @Column({ length: 11 })
  issuerVkn: string;

  /** Alıcının vergi kimlik numarası (10 hane, tüzel kişi) */
  @Column({ length: 11, nullable: true })
  receiverVkn?: string;

  /** Alıcının TC kimlik numarası (11 hane, gerçek kişi) */
  @Column({ length: 11, nullable: true })
  receiverTckn?: string;

  /** Alıcının adı / unvanı */
  @Column({ length: 200, nullable: true })
  receiverName?: string;

  /** Fatura tutarı (KDV dahil) */
  @Column({ type: 'numeric' })
  totalAmount: number;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  /** Oluşturulan UBL 2.1 XML — gönderim öncesi ve sonrasında saklanır */
  @Column({ type: 'text', nullable: true })
  xmlContent?: string;

  /** GİB'den dönen ham yanıt (hata ayıklama için) */
  @Column({ type: 'text', nullable: true })
  gibResponse?: string;

  /** Red veya hata durumunda mesaj */
  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  rejectedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  cancelledAt?: Date;
}
