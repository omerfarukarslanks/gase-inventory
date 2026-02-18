import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ProductAttributeSelectionDto } from './product-attribute-selection.dto';
import { PriceFieldsDto } from 'src/common/dto/price-fields.dto';

export class CreateProductDto extends PriceFieldsDto {
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

  @ApiPropertyOptional({
    type: [ProductAttributeSelectionDto],
    description: 'Product create sirasinda varyant olusturmak icin attribute secimleri',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeSelectionDto)
  attributes?: ProductAttributeSelectionDto[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Urunun eklenecegi magaza id listesi',
    example: ['08443723-dd00-49d2-969b-c27e579178dc'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  storeIds?: string[];

  @ApiPropertyOptional({
    description: 'Urun tum magazalara eklensin mi?',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  applyToAllStores?: boolean;
}
