import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ReportScopeQueryDto } from './report-scope-query.dto';

export class WeekComparisonQueryDto extends ReportScopeQueryDto {
  @ApiPropertyOptional({
    description: 'Karsilastirilacak hafta sayisi (varsayilan 4)',
    example: 4,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(52)
  weeks?: number;
}
