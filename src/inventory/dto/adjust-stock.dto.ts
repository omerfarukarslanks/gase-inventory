import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AdjustStockItemDto {
  @ApiProperty({ description: 'Stok düzeltmesi yapılacak mağaza ID' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId: string;

  @ApiProperty({ description: 'Stok düzeltmesi yapılacak ürün varyant ID' })
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId: string;

  @ApiProperty({ example: 32, description: 'Hedef stok miktarı' })
  @IsNumber()
  @Min(0)
  newQuantity: number;

  @ApiPropertyOptional({ example: 'COUNT-2025-001' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: { reason: 'Sayım farkı' } })
  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;
}

/**
 * Stok düzeltme için 3 senaryo (yalnızca biri gönderilebilir):
 *
 * 1) Tekli varyant: productVariantId + newQuantity (+ opsiyonel storeId / applyToAllStores)
 * 2) Çoklu varyant: items[] — her öğede storeId + productVariantId + newQuantity
 * 3) Ürün bazlı:   productId + newQuantity — ürünün tüm varyantları düzeltilir
 *    (+ opsiyonel storeId / applyToAllStores); productVariantId ve items gönderilemez
 */
export class AdjustStockDto {
  // ---- Senaryo 2: Çoklu ----
  @ApiPropertyOptional({
    type: [AdjustStockItemDto],
    description:
      'Senaryo 2 — Mağaza bazlı toplu stok düzeltme satırları. ' +
      'Gönderilirse productVariantId ve productId gönderilemez.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdjustStockItemDto)
  items?: AdjustStockItemDto[];

  // ---- Ortak opsiyonel alanlar (Senaryo 1 ve 3 için) ----
  @ApiPropertyOptional({ description: 'Tek mağaza için stok düzeltme yapılacak mağaza ID' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({
    description: 'true ise tenant içindeki tüm aktif mağazalara uygular',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  applyToAllStores?: boolean;

  @ApiPropertyOptional({ example: 'COUNT-2025-001' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ example: { reason: 'Sayım farkı' } })
  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;

  // ---- Senaryo 1: Tekli varyant ----
  @ApiPropertyOptional({
    description:
      'Senaryo 1 — Stok düzeltmesi yapılacak ürün varyant ID. ' +
      'items veya productId ile birlikte gönderilemez.',
  })
  @ValidateIf((o) => (!Array.isArray(o.items) || o.items.length === 0) && !o.productId)
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId?: string;

  // ---- Senaryo 3: Ürün bazlı ----
  @ApiPropertyOptional({
    description:
      'Senaryo 3 — Tüm varyantları düzeltilecek ürün ID. ' +
      'items veya productVariantId ile birlikte gönderilemez.',
  })
  @ValidateIf((o) => (!Array.isArray(o.items) || o.items.length === 0) && !o.productVariantId)
  @IsUUID('4')
  @IsNotEmpty()
  productId?: string;

  // ---- Senaryo 1 ve 3 için hedef miktar ----
  @ApiPropertyOptional({ example: 32, description: 'Hedef stok miktarı (items yoksa zorunlu)' })
  @ValidateIf((o) => !Array.isArray(o.items) || o.items.length === 0)
  @IsNumber()
  @Min(0)
  newQuantity?: number;
}
