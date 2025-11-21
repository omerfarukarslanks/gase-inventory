import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Basic T-Shirt v2' })
  name?: string;

  @ApiPropertyOptional({ example: 'TSHIRT-BASIC' })
  sku?: string;

  @ApiPropertyOptional({ example: 'Pamuklu basic tshirt - güncellenmiş açıklama' })
  description?: string;

  @ApiPropertyOptional({ example: '1234567890123' })
  defaultBarcode?: string;

  @ApiPropertyOptional({ example: true, description: 'Ürünün aktiflik durumu' })
  isActive?: boolean;
  
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
