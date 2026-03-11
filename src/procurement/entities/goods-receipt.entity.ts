import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Store } from 'src/store/store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany } from 'typeorm';
import { PurchaseOrder } from './purchase-order.entity';
import { GoodsReceiptLine } from './goods-receipt-line.entity';

@Entity({ name: 'goods_receipts' })
export class GoodsReceipt extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false })
  tenant: Tenant;

  @ManyToOne(() => PurchaseOrder, (po) => po.goodsReceipts, { nullable: false })
  purchaseOrder: PurchaseOrder;

  @ManyToOne(() => Store, { nullable: false, eager: true })
  store: Store;

  @CreateDateColumn({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @OneToMany(() => GoodsReceiptLine, (line) => line.goodsReceipt, { cascade: true })
  lines: GoodsReceiptLine[];
}
