import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ProductAttributeSelectionDto } from './product-attribute-selection.dto';

export class CreateProductDto {
  @ApiProperty({ example: 'Basic T-Shirt' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'TSHIRT-BASIC', description: 'Tenant içinde benzersiz ürün kodu' })
  @IsString()
  @IsOptional()
  sku?: string;
  
  @ApiPropertyOptional({ example: 'Pamuklu basic tshirt' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg', description: 'Ürün resmi' })
  @IsString()
  @IsOptional()
  image?: string;
  // additionalImages?: string[];

  @ApiPropertyOptional({ example: 'TRY', default: 'TRY' })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 299.9, description: 'Varsayılan satış fiyatı' })
  @IsNumber()
  @IsOptional()
  defaultSalePrice?: number;

  @ApiPropertyOptional({ example: 150, description: 'Varsayılan alış fiyatı (tedarik)' })
  @IsNumber()
  @IsOptional()
  defaultPurchasePrice?: number;

  @ApiPropertyOptional({ example: 20, description: 'Varsayılan vergi yüzdesi (KDV)' })
  @IsNumber()
  @IsOptional()
  defaultTaxPercent?: number;

  @ApiPropertyOptional({
    type: [ProductAttributeSelectionDto],
    description: 'Product create sirasinda varyant olusturmak icin attribute secimleri',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeSelectionDto)
  attributes?: ProductAttributeSelectionDto[];
}
