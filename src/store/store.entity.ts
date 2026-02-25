import { AuditableEntity } from 'src/common/entity/auditable-base.entity';
import { SupportedCurrency } from 'src/common/constants/currency.constants';
import { StoreType } from 'src/common/constants/store-type.constants';
import { Tenant } from 'src/tenant/tenant.entity';
import { UserStore } from 'src/user/user-store.entity';
import { Column, Entity, ManyToOne, OneToMany, Unique } from 'typeorm';

@Entity()
@Unique(['tenant', 'slug'])
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

  @Column({ nullable: true })
  slug?: string; // Kısa kod (URL, subdomain vs. için)

  @Column({ nullable: true })
  logo?: string;

  @Column({ nullable: true })
  description?: string;

  /** Mağazanın baz para birimi (varsayılan: TRY) */
  @Column({
    type: 'enum',
    enum: SupportedCurrency,
    default: SupportedCurrency.TRY,
  })
  currency: SupportedCurrency;

  /** Mağaza tipi: perakende veya toptan (varsayılan: RETAIL) */
  @Column({
    type: 'enum',
    enum: StoreType,
    default: StoreType.RETAIL,
  })
  storeType: StoreType;

  @OneToMany(() => UserStore, (userStore) => userStore.store)
  userStores: UserStore[];
}
