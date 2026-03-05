import { Tenant } from 'src/tenant/tenant.entity';
import { UserRole } from 'src/user/user.entity';
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';

/**
 * Tenant bazında rol durumu.
 * Her (tenant, role) çifti için isActive tutulur.
 * isActive=false → o roldeki kullanıcılar yetki kontrolünden geçemez.
 */
@Entity({ name: 'roles' })
@Unique('uq_role_tenant_role', ['tenant', 'role'])
export class Role {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, { eager: false, onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;
}
