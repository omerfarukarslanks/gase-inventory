import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * İdempotency key kaydı.
 * Offline/mobil clientlar aynı isteği tekrar gönderdiğinde DB'den önbelleğe alınmış
 * yanıt döner, işlem ikinci kez uygulanmaz.
 *
 * Varsayılan TTL: 24 saat (uygulama katmanında ayarlanır).
 */
@Entity({ name: 'idempotency_keys' })
@Index('idx_idempotency_tenant_key', ['tenantId', 'key'], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  /** Client'ın `Idempotency-Key` başlığında gönderdiği değer (UUID v4 önerilir) */
  @Column({ length: 200 })
  key: string;

  @Column({ length: 10 })
  method: string;

  @Column({ length: 500 })
  path: string;

  @Column({ type: 'int' })
  responseStatus: number;

  /** Orijinal yanıt gövdesi — tekrar gönderilir */
  @Column({ type: 'jsonb', nullable: true })
  responseBody: any;

  /** Bu süre sonunda kayıt geçersiz sayılır */
  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
