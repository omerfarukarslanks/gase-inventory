import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OutboxEvent } from './outbox-event.entity';
import { OutboxService } from './outbox.service';
import { OutboxProcessor } from './outbox.processor';

@Module({
  imports: [TypeOrmModule.forFeature([OutboxEvent])],
  providers: [OutboxService, OutboxProcessor],
  exports: [OutboxService],
})
export class OutboxModule {}
