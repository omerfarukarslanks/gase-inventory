import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSupplierDto {
  @ApiProperty({ example: 'Tekstil A.Ş.', description: 'Tedarikçi adı (zorunlu)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Yılmaz', description: 'Tedarikçi soyadı veya firma ek adı' })
  @IsString()
  @IsOptional()
  surname?: string;

  @ApiPropertyOptional({ example: 'Bağcılar, İstanbul', description: 'Adres' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '+905321234567', description: 'Telefon numarası' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'info@tekstil.com', description: 'E-posta adresi' })
  @IsEmail()
  @IsOptional()
  email?: string;
}
