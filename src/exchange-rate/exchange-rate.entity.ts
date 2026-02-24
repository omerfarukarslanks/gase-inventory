import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'exchange_rates' })
export class ExchangeRate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Para birimi kodu (USD, EUR) */
  @Column({ length: 3, unique: true })
  currency: string;

  /** 1 birim = kaç TRY (TCMB ForexSelling) */
  @Column({ type: 'numeric', precision: 18, scale: 6 })
  rateToTry: number;

  /** true → son fetch başarısız, önbellek değer kullanılıyor */
  @Column({ default: false })
  isStale: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
