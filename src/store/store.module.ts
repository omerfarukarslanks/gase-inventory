import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Store } from './store.entity';
import { StoresService } from './store.service';

@Module({
  imports: [TypeOrmModule.forFeature([Store])],
  providers: [StoresService],
  exports: [StoresService],
})
export class StoreModule {}
