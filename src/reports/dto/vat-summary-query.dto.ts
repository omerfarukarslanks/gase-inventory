import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReportScopeQueryDto } from './report-scope-query.dto';

export class VatSummaryQueryDto extends ReportScopeQueryDto {
  @ApiProperty({
    description: 'Ay (YYYY-MM formatinda)',
    example: '2026-02',
  })
  @IsString()
  @IsNotEmpty()
  month: string;

  @ApiPropertyOptional({
    description: 'Kirilim: day veya store',
    enum: ['day', 'store'],
  })
  @IsOptional()
  @IsIn(['day', 'store'])
  breakdown?: 'day' | 'store';
}
