import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { SaleReturn } from './sale-return.entity';
import { SaleLine } from './sale-line.entity';

@Entity({ name: 'sale_return_lines' })
export class SaleReturnLine extends AuditableEntity {
  @ManyToOne(() => SaleReturn, (r) => r.lines, { onDelete: 'CASCADE' })
  saleReturn: SaleReturn;

  /** İade edilen orijinal satır */
  @ManyToOne(() => SaleLine, { eager: true, onDelete: 'RESTRICT' })
  saleLine: SaleLine;

  @Column({ type: 'numeric' })
  quantity: number;

  /** İade tutarı (opsiyonel, default 0 — ödeme iade takibi için) */
  @Column({ type: 'numeric', default: 0 })
  refundAmount: number;
}
