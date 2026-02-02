import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'Kadıköy Mağaza' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'KDK-01', description: 'Mağaza kodu' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'Kadıköy, İstanbul' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'kadikoy-magaza', description: 'URL-uyumlu kısa kod' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional({ example: 'Kadıköy şubesi' })
  @IsString()
  @IsOptional()
  description?: string;
}
