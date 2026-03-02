import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Toplu transfer senaryosunda (items[]) her satır için varyant + miktar.
 * fromStoreId ve toStoreId üst DTO'da root-level tanımlanır — tüm satırlar
 * aynı kaynak-hedef mağaza çiftini paylaşır.
 */
export class TransferStockItemDto {
  @ApiProperty({ description: 'Transfer edilecek ürün varyant ID' })
  @IsUUID('4', { message: 'productVariantId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'productVariantId boş olamaz' })
  productVariantId: string;

  @ApiProperty({ example: 10, description: 'Transfer miktarı (> 0)' })
  @IsNumber()
  @IsPositive({ message: 'quantity pozitif olmalıdır' })
  quantity: number;
}

/**
 * Mağazalar arası stok transferi — 3 senaryo (yalnızca biri seçilir):
 *
 * 1) Tekli varyant:   productVariantId + quantity
 * 2) Çoklu varyant:   items[] — her satırda productVariantId + quantity
 * 3) Ürün bazlı:      productId (+ opsiyonel quantity)
 *    - quantity verilirse: her varyant için aynı miktar transfer edilir
 *    - quantity verilmezse: her varyanttaki mevcut stok kadar transfer edilir (tam boşaltma)
 *
 * fromStoreId ve toStoreId tüm senaryolarda zorunludur.
 */
export class TransferStockDto {
  @ApiProperty({ description: 'Kaynak mağaza ID' })
  @IsUUID('4', { message: 'fromStoreId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'fromStoreId boş olamaz' })
  fromStoreId: string;

  @ApiProperty({ description: 'Hedef mağaza ID' })
  @IsUUID('4', { message: 'toStoreId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'toStoreId boş olamaz' })
  toStoreId: string;

  // ---- Senaryo 2: Çoklu varyant ----
  @ApiPropertyOptional({
    type: [TransferStockItemDto],
    description:
      'Senaryo 2 — Toplu transfer satırları. ' +
      'Gönderilirse productVariantId ve productId gönderilemez.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferStockItemDto)
  items?: TransferStockItemDto[];

  // ---- Senaryo 1: Tekli varyant ----
  @ApiPropertyOptional({
    description:
      'Senaryo 1 — Transfer edilecek ürün varyant ID. ' +
      'items veya productId ile birlikte gönderilemez.',
  })
  @ValidateIf((o) => (!Array.isArray(o.items) || o.items.length === 0) && !o.productId)
  @IsUUID('4', { message: 'productVariantId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'productVariantId boş olamaz' })
  productVariantId?: string;

  // ---- Senaryo 3: Ürün bazlı ----
  @ApiPropertyOptional({
    description:
      'Senaryo 3 — Tüm varyantları transfer edilecek ürün ID. ' +
      'items veya productVariantId ile birlikte gönderilemez.',
  })
  @ValidateIf((o) => (!Array.isArray(o.items) || o.items.length === 0) && !o.productVariantId)
  @IsUUID('4')
  @IsNotEmpty()
  productId?: string;

  // ---- Miktar (Senaryo 1 için zorunlu, Senaryo 3 için opsiyonel) ----
  @ApiPropertyOptional({
    example: 10,
    description:
      'Transfer miktarı (> 0). ' +
      'Senaryo 1 için zorunludur. ' +
      'Senaryo 3 için opsiyoneldir — verilmezse her varyanttaki mevcut stok tamamı transfer edilir.',
  })
  @ValidateIf((o) => Boolean(o.productVariantId))
  @IsNumber()
  @IsPositive({ message: 'quantity pozitif olmalıdır' })
  quantity?: number;

  // ---- Ortak opsiyonel alanlar ----
  @ApiPropertyOptional({ example: 'TRF-2025-001', description: 'Referans / belge numarası' })
  @IsOptional()
  @IsString({ message: 'reference metni olmalıdır' })
  reference?: string;

  @ApiPropertyOptional({
    example: { note: 'Merkez depodan şube 1\'e transfer' },
    description: 'Ek meta bilgiler',
  })
  @IsOptional()
  @IsObject({ message: 'meta nesne olmalıdır' })
  meta?: Record<string, any>;
}
