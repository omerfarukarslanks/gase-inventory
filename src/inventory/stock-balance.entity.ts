import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Lot/lokasyon bazında granüler stok bakiyesi.
 * store_variant_stock = tenant × store × variant bazında toplam özet
 * stock_balances      = tenant × store × variant × lot × location bazında detaylı bakiye
 *
 * Bir harekette lot/location bilgisi yoksa bu tabloya kayıt yazılmaz;
 * store_variant_stock güncellenmesi yeterlidir.
 */
@Entity({ name: 'stock_balances' })
@Index('idx_stock_balance_lookup', ['tenantId', 'storeId', 'productVariantId'])
@Index('idx_stock_balance_lot', ['tenantId', 'storeId', 'productVariantId', 'lotNumber'])
export class StockBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'uuid' })
  storeId: string;

  @Column({ type: 'uuid' })
  productVariantId: string;

  /** Lot / parti numarası — NULL ise lot takibi yapılmayan hareket */
  @Column({ length: 100, nullable: true })
  lotNumber?: string;

  /** Son kullanma tarihi */
  @Column({ type: 'date', nullable: true })
  expiryDate?: Date;

  /**
   * Lokasyon ID (Faz 2 Warehouse modülüyle birlikte `locations` tablosuna FK olacak).
   * Şimdilik sade UUID kolonu.
   */
  @Column({ type: 'uuid', nullable: true })
  locationId?: string;

  /** Mevcut stok miktarı (bu lot × lokasyon kombinasyonu için) */
  @Column({ type: 'numeric', default: 0 })
  quantity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
