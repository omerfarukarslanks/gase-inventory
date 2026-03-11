import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Column, Entity, ManyToOne } from 'typeorm';
import { GoodsReceipt } from './goods-receipt.entity';
import { PurchaseOrderLine } from './purchase-order-line.entity';

@Entity({ name: 'goods_receipt_lines' })
export class GoodsReceiptLine extends AuditableEntity {
  @ManyToOne(() => GoodsReceipt, (gr) => gr.lines, { nullable: false, onDelete: 'CASCADE' })
  goodsReceipt: GoodsReceipt;

  @ManyToOne(() => PurchaseOrderLine, { nullable: false, eager: true })
  purchaseOrderLine: PurchaseOrderLine;

  /** Bu teslimatta alınan miktar */
  @Column({ type: 'numeric' })
  receivedQuantity: number;

  /** Lot / parti numarası (Faz 2'de inventory_movements ile ilişkilendirilir) */
  @Column({ length: 100, nullable: true })
  lotNumber?: string;

  /** Son kullanma tarihi */
  @Column({ type: 'date', nullable: true })
  expiryDate?: Date;
}
