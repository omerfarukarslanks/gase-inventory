import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportScopeQueryDto } from './report-scope-query.dto';

export class DeadStockQueryDto extends ReportScopeQueryDto {
  @ApiPropertyOptional({
    description: 'Satissiz gun esigi (varsayilan 30)',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  noSaleDays?: number;
}
