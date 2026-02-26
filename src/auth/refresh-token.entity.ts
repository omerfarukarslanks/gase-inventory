import { Column, Entity, Index, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('refresh_tokens')
@Index(['tokenHash'], { unique: true })
@Index(['userId'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'text' })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
