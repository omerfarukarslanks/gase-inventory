import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserStore } from './user-store.entity';
import { TenantModule } from 'src/tenant/tenant.module';
import { StoreModule } from 'src/store/store.module';
import { UsersService } from './user.service';
import { UserController, StoreUsersController } from './user.controller';
import { Store } from 'src/store/store.entity';

@Module({
    imports: [
    TypeOrmModule.forFeature([User, UserStore, Store]),
    TenantModule,
    StoreModule,
  ],
  controllers: [UserController, StoreUsersController],
  providers: [UsersService],
  exports: [UsersService],})
export class UserModule {}
