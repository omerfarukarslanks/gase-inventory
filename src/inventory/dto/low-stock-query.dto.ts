import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class LowStockQueryDto {
  @ApiPropertyOptional({ default: 10, description: 'Bu değerin altındaki stoklar döner' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  threshold: number = 10;

  @ApiPropertyOptional({ description: 'Belirli bir mağaza filtresi' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;
}
