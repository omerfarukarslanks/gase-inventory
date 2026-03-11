import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from 'src/tenant/tenant.entity';

export enum IntegrationProvider {
  TRENDYOL     = 'TRENDYOL',
  HEPSIBURADA  = 'HEPSIBURADA',
  N11          = 'N11',
  AMAZON       = 'AMAZON',
  EFATURA      = 'EFATURA',
  CUSTOM_WEBHOOK = 'CUSTOM_WEBHOOK',
}

export enum IntegrationStatus {
  ACTIVE   = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  ERROR    = 'ERROR',
}

@Entity({ name: 'integration_connections' })
@Index('idx_integration_tenant_provider', ['tenant', 'provider'])
export class IntegrationConnection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @ManyToOne(() => Tenant, { nullable: false, eager: true })
  tenant: Tenant;

  @Column({ type: 'enum', enum: IntegrationProvider })
  provider: IntegrationProvider;

  /** Kullanıcı tarafından verilen isim (ör. "Trendyol Mağaza 1") */
  @Column({ length: 150 })
  name: string;

  /**
   * API key, token, webhook URL vb. hassas bilgiler.
   * Üretim ortamında şifrelenmiş tutulmalı.
   */
  @Column({ type: 'jsonb', default: '{}' })
  config: Record<string, any>;

  @Column({
    type: 'enum',
    enum: IntegrationStatus,
    default: IntegrationStatus.ACTIVE,
  })
  status: IntegrationStatus;

  /** Son başarılı senkronizasyon zamanı */
  @Column({ type: 'timestamptz', nullable: true })
  lastSyncAt?: Date;

  /** Son hata mesajı */
  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'uuid', nullable: true })
  createdById?: string;

  @Column({ type: 'uuid', nullable: true })
  updatedById?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
