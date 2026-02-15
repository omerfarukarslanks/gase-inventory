import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attribute } from './entity/attribute.entity';
import { AttributeValue } from './entity/attribute-value.entity';
import { AttributeService } from './attribute.service';
import { AttributeController } from './attribute.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Attribute, AttributeValue]),
  ],
  providers: [AttributeService],
  controllers: [AttributeController],
  exports: [AttributeService],
})
export class AttributeModule {}
