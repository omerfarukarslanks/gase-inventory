import {
  Column,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from './user.entity';
import { Store } from 'src/store/store.entity';
import { AuditableEntity } from 'src/common/entity/auditable-base.entity';

export enum StoreUserRole {
  MANAGER = 'MANAGER',
  STAFF = 'STAFF',
}

@Entity({ name: 'user_stores' })
@Unique(['user', 'store'])
export class UserStore extends AuditableEntity {

  @ManyToOne(() => User, (user) => user.userStores, { eager: true })
  user: User;

  @ManyToOne(() => Store, (store) => store.userStores, { eager: true })
  store: Store;

  @Column({
    type: 'enum',
    enum: StoreUserRole,
    default: StoreUserRole.STAFF,
  })
  role: StoreUserRole;
}
