import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, ValidateNested } from 'class-validator';
import { ReceiveStockDto } from './receive-stock.dto';

export class BulkReceiveStockDto {
  @ApiProperty({ type: [ReceiveStockDto], description: 'Toplu stok girişi satırları' })
  @ValidateNested({ each: true })
  @Type(() => ReceiveStockDto)
  @ArrayMinSize(1, { message: 'En az 1 satır gereklidir' })
  items: ReceiveStockDto[];
}
