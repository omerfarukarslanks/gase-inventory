import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SerialNumberStatus {
  /** Stokta mevcut, satılmamış */
  IN_STOCK   = 'IN_STOCK',
  /** Satışa çıktı / müşteriye teslim edildi */
  SOLD       = 'SOLD',
  /** Mağazalar arası transfer sürecinde */
  IN_TRANSIT = 'IN_TRANSIT',
  /** İade alındı, geri stoka girdi */
  RETURNED   = 'RETURNED',
  /** Hurdaya ayrıldı / yazıldı */
  SCRAPPED   = 'SCRAPPED',
}

/**
 * Ürün varyantlarına ait seri numarası yaşam döngüsü.
 *
 * Hareket akışı:
 *   IN_STOCK → SOLD        (satış)
 *   IN_STOCK → IN_TRANSIT  (transfer başlangıcı)
 *   IN_TRANSIT → IN_STOCK  (transfer tamamlandı)
 *   SOLD → RETURNED        (iade)
 *   RETURNED → IN_STOCK    (yeniden stoka alındı)
 *   * → SCRAPPED            (hurda)
 *
 * inventory_movements.serialNumber alanıyla bağlantı:
 * Hareket yazılırken bu tabloda ilgili satır güncellenir.
 * Cross-module FK yerine tenantId + serialNumber string referansı kullanılır.
 */
@Entity({ name: 'serial_numbers' })
@Index('idx_serial_tenant_variant_serial', ['tenantId', 'productVariantId', 'serialNumber'], {
  unique: true,
})
export class SerialNumber {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  /** Ait olduğu mağaza (stok konumu) */
  @Index()
  @Column({ type: 'uuid' })
  storeId: string;

  /** ProductVariant UUID — cross-module FK olmadan sade kolon */
  @Index()
  @Column({ type: 'uuid' })
  productVariantId: string;

  /** Üreticiden gelen veya sisteme girilen seri numarası */
  @Column({ length: 200 })
  serialNumber: string;

  @Column({
    type: 'enum',
    enum: SerialNumberStatus,
    default: SerialNumberStatus.IN_STOCK,
  })
  status: SerialNumberStatus;

  /** Lot numarası (varsa) */
  @Column({ length: 100, nullable: true })
  lotNumber?: string;

  /** Son kullanma / garanti bitiş tarihi */
  @Column({ type: 'date', nullable: true })
  expiryDate?: Date;

  /** Bu seri numarasını stoka alan InventoryMovement ID */
  @Column({ type: 'uuid', nullable: true })
  receivedMovementId?: string;

  /** Satış yapıldığında bağlı SaleLine UUID */
  @Column({ type: 'uuid', nullable: true })
  soldSaleLineId?: string;

  /** İade alındığında bağlı SaleReturn UUID */
  @Column({ type: 'uuid', nullable: true })
  returnId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
