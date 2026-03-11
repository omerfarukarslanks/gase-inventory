import { Column, Entity, Index, ManyToOne } from 'typeorm';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { CountSession } from './count-session.entity';

@Entity({ name: 'count_lines' })
@Index('idx_count_line_session', ['session'])
export class CountLine extends AuditableEntity {
  @ManyToOne(() => CountSession, (s) => s.lines, { nullable: false, onDelete: 'CASCADE' })
  session: CountSession;

  @Index()
  @Column({ type: 'uuid' })
  productVariantId: string;

  /** Lot numarası — NULL ise lot takibi yapılmıyor */
  @Column({ length: 100, nullable: true })
  lotNumber?: string;

  /** Sayımın yapıldığı lokasyon — NULL ise lokasyon bazlı değil */
  @Column({ type: 'uuid', nullable: true })
  locationId?: string;

  /** Sistem kaydına göre beklenen miktar (sayım başındaki snapshot) */
  @Column({ type: 'numeric' })
  expectedQuantity: number;

  /** Fiziksel sayımda tespit edilen miktar — sayılmamışsa NULL */
  @Column({ type: 'numeric', nullable: true })
  countedQuantity?: number;

  /**
   * Fark = countedQuantity - expectedQuantity.
   * Kapatma sırasında hesaplanır ve kaydedilir.
   */
  @Column({ type: 'numeric', nullable: true })
  difference?: number;

  /** Fark için ADJUSTMENT hareketi oluşturuldu mu? */
  @Column({ default: false })
  isAdjusted: boolean;

  /** Oluşturulan inventory movement'ın ID'si */
  @Column({ type: 'uuid', nullable: true })
  adjustmentMovementId?: string;
}
