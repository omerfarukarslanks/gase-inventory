import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';

@Entity({ name: 'purchase_order_lines' })
export class PurchaseOrderLine extends AuditableEntity {
  @ManyToOne(() => PurchaseOrder, (po) => po.lines, { nullable: false, onDelete: 'CASCADE' })
  purchaseOrder: PurchaseOrder;

  /** Ürün varyant ID — cross-module ref, sade UUID */
  @Index()
  @Column({ type: 'uuid' })
  productVariantId: string;

  /** Sipariş edilen miktar */
  @Column({ type: 'numeric' })
  quantity: number;

  /** Şimdiye kadar teslim alınan toplam miktar */
  @Column({ type: 'numeric', default: 0 })
  receivedQuantity: number;

  @Column({ type: 'numeric', nullable: true })
  unitPrice?: number;

  @Column({ type: 'numeric', nullable: true })
  taxPercent?: number;

  /** unitPrice * quantity (vergi hariç) */
  @Column({ type: 'numeric', nullable: true })
  lineTotal?: number;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
