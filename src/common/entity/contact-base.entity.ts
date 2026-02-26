import { Column } from 'typeorm';
import { AuditableEntity } from './auditable-base.entity';

/**
 * Customer ve Supplier arasında paylaşılan kolon tanımları.
 * tenant ilişkisi her concrete entity'de ayrı tanımlanır
 * (circular dep. riski + eager: true farkı nedeniyle).
 */
export abstract class ContactBase extends AuditableEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  surname?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  phoneNumber?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ default: true })
  isActive: boolean;
}
