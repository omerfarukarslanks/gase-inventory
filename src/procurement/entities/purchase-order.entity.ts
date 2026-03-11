import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Store } from 'src/store/store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { PurchaseOrderLine } from './purchase-order-line.entity';
import { GoodsReceipt } from './goods-receipt.entity';

export enum PurchaseOrderStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

@Entity({ name: 'purchase_orders' })
@Index('idx_po_tenant_status', ['tenant', 'status'])
export class PurchaseOrder extends AuditableEntity {
  @ManyToOne(() => Tenant, { nullable: false })
  tenant: Tenant;

  @ManyToOne(() => Store, { nullable: false, eager: true })
  store: Store;

  /** Tedarikçi ID — cross-module ref, sade UUID */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  supplierId?: string;

  @Column({ type: 'enum', enum: PurchaseOrderStatus, default: PurchaseOrderStatus.DRAFT })
  status: PurchaseOrderStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'date', nullable: true })
  expectedAt?: Date;

  @Column({ length: 3, default: 'TRY' })
  currency: string;

  @OneToMany(() => PurchaseOrderLine, (line) => line.purchaseOrder, { cascade: true })
  lines: PurchaseOrderLine[];

  @OneToMany(() => GoodsReceipt, (gr) => gr.purchaseOrder)
  goodsReceipts: GoodsReceipt[];
}
