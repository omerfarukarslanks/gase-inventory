import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { ProductVariant } from 'src/product/product-variant.entity';
import { Store } from 'src/store/store.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
} from 'typeorm';

export enum MovementType {
  IN = 'IN',
  OUT = 'OUT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity({ name: 'inventory_movements' })
@Index('idx_inventory_movement_tenant_store_variant', [
  'tenant',
  'store',
  'productVariant',
])
@Index('idx_inventory_movement_tenant_variant', ['tenant', 'productVariant'])
export class InventoryMovement extends AuditableEntity {
  @ManyToOne(() => Tenant, { eager: true })
  tenant: Tenant;

  @ManyToOne(() => Store, { eager: true })
  store: Store;

  @ManyToOne(() => ProductVariant, { eager: true })
  productVariant: ProductVariant;

  @Column({ type: 'enum', enum: MovementType })
  type: MovementType;

  /**
   * quantity SIGNED:
   * - IN / TRANSFER_IN  -> +pozitif
   * - OUT / TRANSFER_OUT -> -negatif
   * - ADJUSTMENT -> + / -
   */
  @Column({ type: 'numeric' })
  quantity: number;

  @Column({ type: 'jsonb', nullable: true })
  meta?: Record<string, any>;

  // ---------- Fiyat / finans bilgileri (opsiyonel) ----------

  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi' })
  @IsOptional()
  @IsIn(['TRY', 'USD', 'EUR'])
  @Column({ length: 3, nullable: true })
  currency?: string; // "TRY", "USD" vb.

  @Column({ type: 'numeric', nullable: true })
  unitPrice?: number; // birim fiyat (KDV hariç veya dahil - sen nasıl karar verirsen)

  @Column({ type: 'numeric', nullable: true })
  discountPercent?: number; // ör: 10 => %10

  @Column({ type: 'numeric', nullable: true })
  discountAmount?: number; // satır toplam iskonto tutarı

  @Column({ type: 'numeric', nullable: true })
  taxPercent?: number; // ör: 20 => %20 KDV

  @Column({ type: 'numeric', nullable: true })
  taxAmount?: number; // satır toplam vergi tutarı

  @Column({ type: 'numeric', nullable: true })
  lineTotal?: number; // nihai satır toplamı (indirim & vergi sonrası)

  @Column({ nullable: true })
  campaignCode?: string; // kampanya kodu / ismi

  @Column({ nullable: true })
  saleId?: string;

  @Column({ nullable: true })
  saleLineId?: string;
}
