import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ReportScopeQueryDto } from './report-scope-query.dto';

export class CustomerQueryDto extends ReportScopeQueryDto {
  @ApiPropertyOptional({
    description: 'Musteri ID filtresi',
    example: '08443723-dd00-49d2-969b-c27e579178dc',
  })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

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
