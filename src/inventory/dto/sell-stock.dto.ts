import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger/dist/decorators/api-property.decorator";

export class SellStockDto {
  @ApiProperty({ description: 'Satış yapılan mağaza ID' })
  storeId: string;

  @ApiProperty({ description: 'Satılan ürün varyant ID' })
  productVariantId: string;

  @ApiProperty({ example: 2, description: 'Satılan miktar (> 0)' })
  quantity: number; // > 0

  @ApiPropertyOptional({ example: 'POS-2025-001' })
  reference?: string;

  @ApiPropertyOptional({
    example: { posTerminal: 'Kasa 1' },
  })
  meta?: Record<string, any>;

  // Satış fiyatı ve kampanya bilgisi

  @ApiPropertyOptional({ example: 'TRY' })
  currency?: string;

  @ApiPropertyOptional({ example: 299.9 })
  unitPrice?: number;
  @ApiPropertyOptional({ example: 15 })
  discountPercent?: number;
  @ApiPropertyOptional({ example: 45 })
  discountAmount?: number;
  @ApiPropertyOptional({ example: 18 })
  taxPercent?: number;
  @ApiPropertyOptional({ example: 54 })
  taxAmount?: number;
  @ApiPropertyOptional({ example: 1200 })
  lineTotal?: number;
  @ApiPropertyOptional({ example: 'CAMP-SUMMER2025' })
  campaignCode?: string;

  // Satış fişi bağlamak için (SalesService içinden dolduracağız)

  @ApiPropertyOptional({ description: 'İlgili satış fişi ID (SalesService iç kullanım)' })
  saleId?: string;

  @ApiPropertyOptional({ description: 'İlgili satış satırı ID (SalesService iç kullanım)' })
  saleLineId?: string;
}
