import {
  Column,
  Entity,
  ManyToOne,
} from 'typeorm';
import { Sale } from './sale.entity';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { ProductVariant } from 'src/product/product-variant.entity';

@Entity({ name: 'sale_lines' })
export class SaleLine extends AuditableEntity {
  @ManyToOne(() => Sale, (sale) => sale.lines, { onDelete: 'CASCADE' })
  sale: Sale;

  @ManyToOne(() => ProductVariant, { eager: true })
  productVariant: ProductVariant;

  @Column({ type: 'numeric' })
  quantity: number;

  @Column({ type: 'varchar', length: 3, nullable: true })
  currency?: string;

  @Column({ type: 'numeric', nullable: true })
  unitPrice?: number;

  @Column({ type: 'numeric', nullable: true })
  discountPercent?: number;

  @Column({ type: 'numeric', nullable: true })
  discountAmount?: number;

  @Column({ type: 'numeric', nullable: true })
  taxPercent?: number;

  @Column({ type: 'numeric', nullable: true })
  taxAmount?: number;

  @Column({ type: 'numeric', nullable: true })
  lineTotal?: number;

  @Column({ nullable: true })
  campaignCode?: string;
}
