import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger/dist/decorators/api-property.decorator';
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
 * Tekil stok giriş kalemi (items[] içindeki her öğe veya tekil senaryo için).
 * Finansal alanlar (fiyat, vergi, iskonto) bu akışta takip edilmez.
 */
export class ReceiveStockItemDto {
  @ApiProperty({ description: 'Stok girişi yapılacak mağaza ID' })
  @IsUUID('4', { message: 'storeId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'storeId boş olamaz' })
  storeId: string;

  @ApiProperty({ description: 'Stok girişi yapılacak ürün varyant ID' })
  @IsUUID('4', { message: 'productVariantId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'productVariantId boş olamaz' })
  productVariantId: string;

  @ApiProperty({ example: 100, description: 'Giren miktar (> 0)' })
  @IsPositive({ message: 'quantity pozitif olmalıdır' })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({
    description: 'Stok girişinin yapıldığı tedarikçi ID (opsiyonel)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'supplierId geçerli bir UUID olmalıdır' })
  supplierId?: string;

  @ApiPropertyOptional({ example: 'PO-2025-001', description: 'Fatura / belge numarası' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    example: { note: 'İlk parti' },
    description: 'Ek meta bilgiler',
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;

  // ---- Lot / lokasyon / seri (Faz 2) ----

  @ApiPropertyOptional({ example: 'LOT-2025-001', description: 'Lot / parti numarası' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31', description: 'Son kullanma tarihi (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Depo lokasyon ID' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ example: 'SN-ABC-001', description: 'Seri numarası' })
  @IsOptional()
  @IsString()
  serialNumber?: string;
}

/**
 * Stok girişi için birleşik DTO — tek endpoint, 3 senaryo:
 *
 * 1) Tekli: storeId + productVariantId + quantity
 * 2) Toplu: items[] — her öğede storeId + productVariantId + quantity (+ opsiyonel supplierId)
 * 3) Ürün bazlı: storeId + productId + quantity — ürünün tüm varyantları aynı storeId/quantity/supplierId ile girilir
 */
export class ReceiveStockDto {
  // ---- Senaryo 2: Toplu ----
  @ApiPropertyOptional({
    type: [ReceiveStockItemDto],
    description:
      'Senaryo 2 — Toplu stok giriş satırları. ' +
      'Gönderilirse tekil alanlar (storeId, productVariantId, productId, quantity) gönderilemez.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveStockItemDto)
  items?: ReceiveStockItemDto[];

  // ---- Senaryo 1 ve 3 için ortak: mağaza + miktar ----
  @ApiPropertyOptional({ description: 'Senaryo 1 ve 3 — Stok girişi yapılacak mağaza ID' })
  @ValidateIf((o) => !Array.isArray(o.items) || o.items.length === 0)
  @IsUUID('4', { message: 'storeId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'storeId boş olamaz' })
  storeId?: string;

  @ApiPropertyOptional({ example: 100, description: 'Senaryo 1 ve 3 — Giren miktar (> 0)' })
  @ValidateIf((o) => !Array.isArray(o.items) || o.items.length === 0)
  @IsPositive({ message: 'quantity pozitif olmalıdır' })
  @IsNumber()
  quantity?: number;

  // ---- Senaryo 1: Tekil varyant ----
  @ApiPropertyOptional({
    description:
      'Senaryo 1 — Stok girişi yapılacak ürün varyant ID. ' +
      'items veya productId ile birlikte gönderilemez.',
  })
  @ValidateIf((o) => (!Array.isArray(o.items) || o.items.length === 0) && !o.productId)
  @IsUUID('4', { message: 'productVariantId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'productVariantId boş olamaz' })
  productVariantId?: string;

  // ---- Senaryo 3: Ürün bazlı (tüm varyantlar) ----
  @ApiPropertyOptional({
    description:
      'Senaryo 3 — Tüm varyantları stok girişi yapılacak ürün ID. ' +
      'items veya productVariantId ile birlikte gönderilemez.',
  })
  @ValidateIf((o) => (!Array.isArray(o.items) || o.items.length === 0) && !o.productVariantId)
  @IsUUID('4')
  @IsNotEmpty()
  productId?: string;

  // ---- Ortak opsiyonel alanlar (Senaryo 1 ve 3) ----
  @ApiPropertyOptional({
    description: 'Stok girişinin yapıldığı tedarikçi ID (Senaryo 1 ve 3; Senaryo 2\'de items[].supplierId kullanılır)',
  })
  @IsOptional()
  @IsUUID('4', { message: 'supplierId geçerli bir UUID olmalıdır' })
  supplierId?: string;

  @ApiPropertyOptional({ example: 'PO-2025-001', description: 'Fatura / belge numarası' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({
    example: { note: 'İlk parti' },
    description: 'Ek meta bilgiler',
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;

  // ---- Lot / lokasyon / seri (Faz 2) ----

  @ApiPropertyOptional({ example: 'LOT-2025-001', description: 'Lot / parti numarası (Senaryo 1 ve 3)' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31', description: 'Son kullanma tarihi YYYY-MM-DD (Senaryo 1 ve 3)' })
  @IsOptional()
  @IsString()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Depo lokasyon ID (Senaryo 1 ve 3)' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiPropertyOptional({ example: 'SN-ABC-001', description: 'Seri numarası (Senaryo 1 ve 3)' })
  @IsOptional()
  @IsString()
  serialNumber?: string;
}
