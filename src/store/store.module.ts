import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './store.entity';
import { StoresService } from './store.service';
import { StoreController } from './store.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  controllers: [StoreController],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoreModule {}
