import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { SaleReturn } from './sale-return.entity';
import { SaleLine } from './sale-line.entity';

export interface PackageVariantReturnRecord {
  productVariantId: string;
  quantity: number;
}

@Entity({ name: 'sale_return_lines' })
export class SaleReturnLine extends AuditableEntity {
  @ManyToOne(() => SaleReturn, (r) => r.lines, { onDelete: 'CASCADE' })
  saleReturn: SaleReturn;

  /** İade edilen orijinal satır */
  @ManyToOne(() => SaleLine, { eager: true, onDelete: 'RESTRICT' })
  saleLine: SaleLine;

  /**
   * Perakende iade veya tam paket birimi iadesi için iade miktarı.
   * Varyant bazlı paket iadelerinde 0 olur — asıl detay packageVariantReturns'da tutulur.
   */
  @Column({ type: 'numeric', default: 0 })
  quantity: number;

  /**
   * Paket satır iadelerinde varyant bazlı iade detayı.
   * Her eleman: { productVariantId, quantity }
   * Perakende satır iadelerinde null olur.
   */
  @Column({ type: 'jsonb', nullable: true })
  packageVariantReturns?: PackageVariantReturnRecord[] | null;

  /** İade tutarı (opsiyonel, default 0 — ödeme iade takibi için) */
  @Column({ type: 'numeric', default: 0 })
  refundAmount: number;
}
