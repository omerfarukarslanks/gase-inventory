import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateStoreDto {
  @ApiPropertyOptional({ example: 'Kadıköy Mağaza v2' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'KDK-02', description: 'Mağaza kodu' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'Kadıköy, İstanbul' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: 'kadikoy-magaza-v2', description: 'URL-uyumlu kısa kod' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional({ example: 'Kadıköy şubesi - güncellenmiş' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true, description: 'Mağaza aktiflik durumu' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
