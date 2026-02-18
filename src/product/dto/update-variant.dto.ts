import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateVariantDto {
  @ApiPropertyOptional({ example: 'Kırmızı / XL' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'RED-XL', description: 'Varyant kodu' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({
    example: { color: 'Red', size: 'XL' },
    description: 'Serbest biçimli attribute bilgileri (renk, beden vb.)',
  })
  @IsOptional()
  attributes?: Record<string, any>;

  @ApiPropertyOptional({
    example: true,
    description: 'Varyant aktiflik durumu',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
