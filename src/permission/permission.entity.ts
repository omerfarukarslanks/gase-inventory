import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Sistemdeki tüm yetki tanımları (global — tüm tenant'lar için aynı).
 * Uygulama ayağa kalkınca seeder tarafından doldurulur.
 */
@Entity({ name: 'permissions' })
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Yetki adı — unique ve sabit (kod ile eşleşmelidir). */
  @Column({ unique: true })
  name: string;

  @Column({ nullable: true })
  description?: string;

  /** UI'da gruplama için (Stok, Satış, Ürün ...) */
  @Column({ nullable: true })
  group?: string;

  /** false → bu yetki tamamen devre dışı (hiçbir role atanamaz / guard'dan geçmez) */
  @Column({ default: true })
  isActive: boolean;
}
