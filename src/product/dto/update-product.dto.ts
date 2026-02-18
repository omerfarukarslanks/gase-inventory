import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { PriceFieldsDto } from 'src/common/dto/price-fields.dto';

export class UpdateProductDto extends PriceFieldsDto {
  @ApiPropertyOptional({ example: 'Basic T-Shirt v2' })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'TSHIRT-BASIC' })
  @IsString()
  @IsOptional()
  sku?: string;

  @ApiPropertyOptional({ example: 'Pamuklu basic tshirt - güncellenmiş açıklama' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true, description: 'Ürünün aktiflik durumu' })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
  
  @ApiPropertyOptional({ example: 'https://example.com/image.jpg', description: 'Ürün resmi' })
  @IsString()
  @IsOptional()
  image?: string;
  // additionalImages?: string[];

  @ApiPropertyOptional({
    type: [String],
    description: 'Urunun aktif olacagi magaza id listesi',
    example: ['08443723-dd00-49d2-969b-c27e579178dc'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  storeIds?: string[];

  @ApiPropertyOptional({
    description: 'Urun tum magazalarda aktif olsun mu?',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  applyToAllStores?: boolean;
}
