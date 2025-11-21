import { AuditableEntity } from "src/common/entity/auditable-base.entity";
import { Tenant } from "src/tenant/tenant.entity";
import { UserStore } from "src/user/user-store.entity";
import { Column, CreateDateColumn, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Store extends AuditableEntity {
  @ManyToOne(() => Tenant, (tenant) => tenant.stores, { eager: true })
  tenant: Tenant;

  @Column()
  name: string;

  @Column({ nullable: true })
  code?: string; // Mağaza kodu

  @Column({ nullable: true })
  address?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ unique: true })
  slug?: string; // Kısa kod (URL, subdomain vs. için)

  @Column({ nullable: true })
  logo?: string;

  @Column({ nullable: true })
  description?: string;

  @OneToMany(() => UserStore, (userStore) => userStore.store)
  userStores: UserStore[];
}