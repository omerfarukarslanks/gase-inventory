import { AuditableEntity } from "src/common/entity/auditable-base.entity";
import { Store } from "src/store/store.entity";
import { User } from "src/user/user.entity";
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class Tenant extends AuditableEntity {
  @Column({ unique: true })
  name: string; // Firma adı

  @Column({nullable: true, unique: true })
  slug?: string; // Kısa kod (URL, subdomain vs. için)

  @Column({ nullable: true })
  logo?: string;

  @Column({ nullable: true })
  description?: string;

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToMany(() => Store, (store) => store.tenant)
  stores: Store[];

  @Column({ default: true })
  isActive: boolean;
  }