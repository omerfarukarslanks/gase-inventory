import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { Store } from 'src/store/store.entity';
import { Column, Entity, Index, ManyToOne, OneToMany } from 'typeorm';
import { Sale } from './sale.entity';
import { SaleReturnLine } from './sale-return-line.entity';

@Entity({ name: 'sale_returns' })
@Index(['tenant', 'sale', 'createdAt'])
export class SaleReturn extends AuditableEntity {
  @ManyToOne(() => Tenant, { eager: false, onDelete: 'CASCADE' })
  tenant: Tenant;

  @ManyToOne(() => Sale, { eager: false, onDelete: 'CASCADE' })
  sale: Sale;

  @ManyToOne(() => Store, { eager: false, onDelete: 'CASCADE' })
  store: Store;

  /** Otomatik üretilen iade numarası */
  @Column({ nullable: true })
  returnNo?: string;

  @Column({ nullable: true })
  notes?: string;

  /** Toplam iade tutarı */
  @Column({ type: 'numeric', default: 0 })
  totalRefundAmount: number;

  @OneToMany(() => SaleReturnLine, (l) => l.saleReturn, { cascade: true })
  lines: SaleReturnLine[];
}
