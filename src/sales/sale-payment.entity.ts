import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { SupportedCurrency } from 'src/common/constants/currency.constants';
import { Column, Entity, ManyToOne } from 'typeorm';
import { Sale } from './sale.entity';

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  OTHER = 'OTHER',
}

export enum SalePaymentStatus {
  ACTIVE = 'ACTIVE',       // Ödeme yapıldı
  CANCELLED = 'CANCELLED', // Ödeme geri alındı
  UPDATED = 'UPDATED',     // Ödeme güncellendi (cancel + recreate akışında yeni kayıt)
}

@Entity({ name: 'sale_payments' })
export class SalePayment extends AuditableEntity {
  @ManyToOne(() => Sale, (sale) => sale.payments, { onDelete: 'CASCADE' })
  sale: Sale;

  @Column({ type: 'numeric' })
  amount: number;

  @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
  paymentMethod: PaymentMethod;

  @Column({ nullable: true })
  note?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  paidAt: Date;

  @Column({
    type: 'enum',
    enum: SalePaymentStatus,
    default: SalePaymentStatus.ACTIVE,
  })
  status: SalePaymentStatus;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt?: Date | null;

  @Column({ type: 'uuid', nullable: true })
  cancelledById?: string | null;

  /** Ödemenin yapıldığı para birimi */
  @Column({
    type: 'enum',
    enum: SupportedCurrency,
    default: SupportedCurrency.TRY,
  })
  currency: SupportedCurrency;

  /**
   * Ödeme anındaki kur snapshot'ı.
   * 1 birim payment.currency = exchangeRate birim store.currency
   * (TRY ödeme ise 1.0, USD ödeme + TRY mağaza ise ~38.5)
   */
  @Column({ type: 'numeric', precision: 18, scale: 6, default: 1 })
  exchangeRate: number;

  /**
   * amount × exchangeRate — mağazanın baz para birimindeki karşılık.
   * paidAmount hesabı bu alan üzerinden yapılır.
   */
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  amountInBaseCurrency: number;
}
