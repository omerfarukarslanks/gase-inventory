import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { ReportScopeQueryDto } from './report-scope-query.dto';

export class CustomerQueryDto extends ReportScopeQueryDto {
  @ApiPropertyOptional({
    description: 'Musteri telefon numarasi filtresi',
    example: '05551234567',
  })
  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Musteri email filtresi',
    example: 'test@example.com',
  })
  @IsOptional()
  @IsString()
  email?: string;
}
