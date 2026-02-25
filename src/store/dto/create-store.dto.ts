import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { SupportedCurrency } from 'src/common/constants/currency.constants';
import { StoreType } from 'src/common/constants/store-type.constants';

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

  @ApiPropertyOptional({
    example: SupportedCurrency.TRY,
    description: 'Mağazanın baz para birimi (varsayılan: TRY)',
    enum: SupportedCurrency,
    default: SupportedCurrency.TRY,
  })
  @IsEnum(SupportedCurrency)
  @IsOptional()
  currency?: SupportedCurrency;

  @ApiPropertyOptional({
    example: StoreType.RETAIL,
    description: 'Mağaza tipi: perakende (RETAIL) veya toptan (WHOLESALE)',
    enum: StoreType,
    default: StoreType.RETAIL,
  })
  @IsEnum(StoreType)
  @IsOptional()
  storeType?: StoreType;
}
