// src/transfer/stock-transfer-line.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { StockTransfer } from './stock-transfer.entity';
import { ProductVariant } from '../product/product-variant.entity';

@Entity('stock_transfer_line')
export class StockTransferLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StockTransfer, (t) => t.lines, { onDelete: 'CASCADE' })
  transfer: StockTransfer;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  productVariant: ProductVariant;

  @Column('numeric', { precision: 12, scale: 3 })
  quantity: number;

  // 🔹 Gönderen mağazanın stok durumu
  @Column('numeric', { precision: 12, scale: 3 })
  fromStoreStockBefore: number;

  @Column('numeric', { precision: 12, scale: 3 })
  fromStoreStockAfter: number;

  // 🔹 Alan mağazanın stok durumu
  @Column('numeric', { precision: 12, scale: 3 })
  toStoreStockBefore: number;

  @Column('numeric', { precision: 12, scale: 3 })
  toStoreStockAfter: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  createdById?: string | null;

  @Column({ type: 'uuid', nullable: true })
  updatedById?: string | null;
}
