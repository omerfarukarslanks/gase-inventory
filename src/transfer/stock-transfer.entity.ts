// src/transfer/stock-transfer.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  Column,
} from 'typeorm';
import { Tenant } from '../tenant/tenant.entity';
import { Store } from '../store/store.entity';
import { StockTransferStatus } from './stock-transfer-status.enum';
import { StockTransferLine } from './stock-transfer-line.entity';

@Entity('stock_transfer')
export class StockTransfer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  tenant: Tenant;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  fromStore: Store;

  @ManyToOne(() => Store, { onDelete: 'CASCADE' })
  toStore: Store;

  @OneToMany(() => StockTransferLine, (line) => line.transfer, {
    cascade: true,
  })
  lines: StockTransferLine[];

  @Column({
    type: 'enum',
    enum: StockTransferStatus,
    default: StockTransferStatus.COMPLETED,
  })
  status: StockTransferStatus;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @Column({ type: 'timestamp', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'now()' })
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  createdById?: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById?: string | null;
}
