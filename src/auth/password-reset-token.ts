import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('password_reset_tokens')
@Index(['userId'])
@Index(['tokenHash'], { unique: true })
export class PasswordResetToken extends AuditableEntity {
@Column({ type: 'uuid' })
  userId: string;

  // multi-tenant istersen:
  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt?: Date;
}
