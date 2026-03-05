import { Tenant } from 'src/tenant/tenant.entity';
import { UserRole } from 'src/user/user.entity';
import {
  Column,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Permission } from './permission.entity';

/**
 * Tenant bazında role → yetki eşlemesi.
 * Her tenant, kendi rol-yetki haritasını OWNER üzerinden yönetebilir.
 */
@Entity({ name: 'role_permissions' })
@Unique('uq_role_perm_tenant_role_perm', ['tenant', 'role', 'permission'])
@Index('idx_role_perm_tenant_role', ['tenant', 'role'])
export class RolePermission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Tenant, { eager: false, onDelete: 'CASCADE' })
  tenant: Tenant;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @ManyToOne(() => Permission, { eager: true, onDelete: 'CASCADE' })
  permission: Permission;
}
