import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateProductDto {
  @ApiProperty({ example: 'Basic T-Shirt' })
  name: string;

  @ApiPropertyOptional({ example: 'TSHIRT-BASIC', description: 'Tenant içinde benzersiz ürün kodu' })
  sku?: string;
  
  @ApiPropertyOptional({ example: 'Pamuklu basic tshirt' })
  description?: string;
  
  @ApiPropertyOptional({ example: '1234567890123', description: 'Varsayılan barkod (varyant yoksa)' })
  defaultBarcode?: string;

  @ApiPropertyOptional({ example: 'https://example.com/image.jpg', description: 'Ürün resmi' })
  image?: string;
  // additionalImages?: string[];

  @ApiPropertyOptional({ example: 'TRY', default: 'TRY' })
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 299.9, description: 'Varsayılan satış fiyatı' })
  defaultSalePrice?: number;

  @ApiPropertyOptional({ example: 150, description: 'Varsayılan alış fiyatı (tedarik)' })
  defaultPurchasePrice?: number;

  @ApiPropertyOptional({ example: 20, description: 'Varsayılan vergi yüzdesi (KDV)' })
  defaultTaxPercent?: number;
}
