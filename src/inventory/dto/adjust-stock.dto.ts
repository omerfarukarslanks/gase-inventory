import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger/dist/decorators/api-property.decorator";

export class AdjustStockDto {
  @ApiProperty({ description: 'Stok düzeltmesi yapılacak mağaza ID' })
  storeId: string;

  @ApiProperty({ description: 'Stok düzeltmesi yapılacak ürün varyant ID' })
  productVariantId: string;
  
  // hedef stok miktarı (absolute), servis içinde mevcut stokla farkını ADJUSTMENT olarak yazarsın
  @ApiProperty({
    example: 32,
    description: 'Sayım sonrası olması gereken stok miktarı (hedef değer)',
  })
  newQuantity: number;

  @ApiPropertyOptional({ example: 'COUNT-2025-001' })
  reference?: string; // Sayım fişi, belge no vs.

  @ApiPropertyOptional({
    example: { reason: 'Sayım farkı', note: '5 adet fire' },
  })
  meta?: Record<string, any>; // {"reason": "Sayım farkı", "note": "..."} gibi
}
