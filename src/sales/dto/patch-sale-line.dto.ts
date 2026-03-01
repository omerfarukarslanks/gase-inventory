import { ApiPropertyOptional } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

/**
 * Mevcut bir satış satırını cerrahi olarak güncellemek için kullanılır.
 * - productVariantId / productPackageId değiştirilemez (ürün kimliği)
 * - quantity değiştirilirse stok hareketi otomatik ayarlanır
 * - Diğer alanlar yalnızca finansal güncelleme yapar, stok hareketi yoktur
 */
export class PatchSaleLineDto {
  @ApiPropertyOptional({ description: 'Yeni miktar (> 0) — stok farkı otomatik ayarlanır', example: 3 })
  @IsOptional()
  @IsPositive()
  @IsNumber()
  quantity?: number;

  @ApiPropertyOptional({ description: 'Birim fiyat', example: 299.9 })
  @IsOptional()
  @IsPositive()
  @IsNumber()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'İndirim yüzdesi', example: 10 })
  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'İndirim tutarı', example: 30 })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ description: 'KDV yüzdesi', example: 18 })
  @IsOptional()
  @IsNumber()
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'KDV tutarı', example: 54 })
  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @ApiPropertyOptional({ description: 'Para birimi', example: 'TRY' })
  @IsOptional()
  @IsIn(['TRY', 'USD', 'EUR'])
  currency?: string;

  @ApiPropertyOptional({ description: 'Kampanya kodu', example: 'CAMP-SUMMER2025' })
  @IsOptional()
  @IsString()
  campaignCode?: string;
}
