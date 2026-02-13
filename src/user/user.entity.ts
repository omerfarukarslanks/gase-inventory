import { Tenant } from "src/tenant/tenant.entity";
import { Column, Entity, ManyToOne, OneToMany, Unique } from "typeorm";
import { UserStore } from "./user-store.entity";
import { AuditableEntity } from "src/common/entity/auditable-base.entity";

export enum UserRole {
  OWNER = 'OWNER',   // Tenant sahibi
  ADMIN = 'ADMIN',   // Tenant genel yöneticisi
  MANAGER = 'MANAGER', // Mağaza yöneticisi
  STAFF = 'STAFF',   // Çalışan
}

@Entity()
@Unique(['email'])
export class User extends AuditableEntity {
  @ManyToOne(() => Tenant, (tenant) => tenant.users, { eager: true })
  tenant: Tenant;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  passwordHash?: string;

  @Column()
  name: string;

  @Column()
  surname: string;

  @Column({ default: 'local' })
  authProvider: string; // 'local' | 'google' | 'microsoft'

  @Column({ nullable: true })
  authProviderId?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', nullable: true })
  birthDate?: Date;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  avatar?: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.STAFF,
  })
  role: UserRole;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => UserStore, (userStore) => userStore.user)
  userStores: UserStore[];
}