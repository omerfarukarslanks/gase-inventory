import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger/dist/decorators/api-property.decorator";

export class TransferStockDto {
  @ApiProperty({ description: 'Kaynak mağaza ID' })
  fromStoreId: string;

  @ApiProperty({ description: 'Hedef mağaza ID' })
  toStoreId: string;

  @ApiProperty({ description: 'Transfer edilecek ürün varyant ID' })
  productVariantId: string;

  @ApiProperty({ example: 10, description: 'Transfer miktarı (> 0)' })
  quantity: number; // > 0

  @ApiPropertyOptional({ example: 'TRF-2025-001' })
  reference?: string;

  @ApiPropertyOptional({
    example: { note: 'Merkez depodan şube 1\'e transfer' },
  })
  meta?: Record<string, any>;
}
