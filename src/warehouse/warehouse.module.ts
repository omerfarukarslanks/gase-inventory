import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { Location } from './entities/location.entity';
import { CountSession } from './entities/count-session.entity';
import { CountLine } from './entities/count-line.entity';
import { PutawayTask } from './entities/putaway-task.entity';
import { Wave } from './entities/wave.entity';
import { PickingTask } from './entities/picking-task.entity';
import { WarehouseService } from './warehouse.service';
import { WarehouseController } from './warehouse.controller';
import { InventoryModule } from 'src/inventory/inventory.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Warehouse,
      Location,
      CountSession,
      CountLine,
      PutawayTask,
      Wave,
      PickingTask,
    ]),
    InventoryModule,
  ],
  providers: [WarehouseService],
  controllers: [WarehouseController],
  exports: [WarehouseService],
})
export class WarehouseModule {}
