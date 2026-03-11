import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'exchange_rates' })
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Para birimi kodu (USD, EUR) */
  @Column({ length: 3 })
  currency: string;

  /**
   * Tenant override: NULL = global (tüm tenantlara uygulanır), dolu = tenant'a özel kur.
   * Lookup sırası: önce tenant-specific, yoksa global (NULL).
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  /** 1 birim = kaç TRY (TCMB ForexSelling) */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  rateToTry: number;

  /** true → son fetch başarısız, önbellek değer kullanılıyor */
  @Column({ default: false })
  isStale: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
