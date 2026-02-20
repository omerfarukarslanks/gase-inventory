import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportScopeQueryDto } from './report-scope-query.dto';

export class ReorderQueryDto extends ReportScopeQueryDto {
  @ApiPropertyOptional({
    description: 'Guvenlik stoku gun sayisi (varsayilan 7)',
    example: 7,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  safetyStockDays?: number;
}
