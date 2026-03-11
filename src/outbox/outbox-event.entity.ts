import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum OutboxEventStatus {
  PENDING     = 'PENDING',
  SENT        = 'SENT',
  FAILED      = 'FAILED',
  /** Maksimum yeniden deneme sayısına ulaşıldı — manuel müdahale gerekir */
  DEAD_LETTER = 'DEAD_LETTER',
}

@Entity({ name: 'outbox_events' })
@Index('idx_outbox_status_next_retry', ['status', 'nextRetryAt'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  /** Örn: goods_receipt.created, purchase_order.approved */
  @Column({ length: 100 })
  eventType: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, any>;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    default: OutboxEventStatus.PENDING,
  })
  status: OutboxEventStatus;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  /** Worker bir sonraki işleme zamanı — başlangıçta createdAt ile aynı */
  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt?: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt?: Date;

  /** Hata mesajı */
  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
