import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Gender } from '../customer.entity';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Ahmet', description: 'Müşteri adı (zorunlu)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Yılmaz', description: 'Müşteri soyadı' })
  @IsString()
  @IsOptional()
  surname?: string;

  @ApiPropertyOptional({ example: 'Atatürk Cad. No:1', description: 'Adres' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'Türkiye', description: 'Ülke' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ example: 'İstanbul', description: 'Şehir' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'Kadıköy', description: 'İlçe' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ example: '+905321234567', description: 'Telefon numarası' })
  @IsString()
  @IsOptional()
  phoneNumber?: string;

  @ApiPropertyOptional({ example: 'ahmet@example.com', description: 'E-posta adresi' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: 'male',
    description: 'Cinsiyet',
    enum: Gender,
  })
  @IsEnum(Gender)
  @IsOptional()
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-05-15', description: 'Doğum tarihi (YYYY-MM-DD)' })
  @IsDateString()
  @IsOptional()
  birthDate?: string;
}
