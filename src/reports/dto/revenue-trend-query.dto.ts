import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { ReportScopeQueryDto } from './report-scope-query.dto';

export class RevenueTrendQueryDto extends ReportScopeQueryDto {
  @ApiPropertyOptional({
    description: 'Gruplama periyodu',
    enum: ['day', 'week', 'month'],
    example: 'day',
  })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month';
}
