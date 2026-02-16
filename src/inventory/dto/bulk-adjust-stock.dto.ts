import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { AdjustStockDto } from './adjust-stock.dto';

export class BulkAdjustStockDto {
  @ApiProperty({ type: [AdjustStockDto], description: 'Toplu stok düzeltme satırları' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdjustStockDto)
  items: AdjustStockDto[];
}
