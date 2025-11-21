import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger/dist/decorators/api-property.decorator";
import { IsIn, IsNotEmpty, IsNumber, IsObject, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";

export class ReceiveStockDto {
  @ApiProperty({ description: 'Stok girişi yapılacak mağaza ID' })
  @IsUUID('4', { message: 'storeId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'storeId boş olamaz' })
  storeId: string;

  @ApiProperty({ description: 'Stok girişi yapılacak ürün varyant ID' })
  @IsUUID('4', { message: 'productVariantId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'productVariantId boş olamaz' })
  productVariantId: string;

  @ApiProperty({ example: 100, description: 'Giren miktar (> 0)' })
  @IsNotEmpty({ message: 'quantity boş olamaz' })
  @IsPositive({ message: 'quantity pozitif olmalıdır' })
  @IsNumber()
  quantity: number; // > 0 olmalı

  @ApiPropertyOptional({ example: 'PO-2025-001', description: 'Fatura / belge numarası' })
  @IsOptional()
  @IsString({ message: 'reference metni olmalıdır' })
  reference?: string;

  @ApiPropertyOptional({
    example: { supplier: 'Tedarikçi A' },
    description: 'Ek meta bilgiler',
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, any>;

  // Fiyat alanları (genelde alış fiyatı)

  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi' })
  @IsOptional()
  @IsIn(['TRY', 'USD', 'EUR'])
  currency?: string;

  @ApiPropertyOptional({ example: 150, description: 'Birim fiyat' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  unitPrice?: number;

  @ApiPropertyOptional({ example: 10, description: 'İskonto yüzdesi' })
  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @ApiPropertyOptional({ example: 50, description: 'Toplam iskonto tutarı' })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ example: 20, description: 'Vergi yüzdesi (KDV vb.)' })
  @IsOptional()
  @IsNumber()
  taxPercent?: number;

  @ApiPropertyOptional({ example: 100, description: 'Toplam vergi tutarı' })
  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @ApiPropertyOptional({ example: 1200, description: 'Satır toplamı (indirim & vergi sonrası)' })
  @IsOptional()
  @IsNumber()
  lineTotal?: number;

  @ApiPropertyOptional({ example: 'CAMP-NEWYEAR' })
  @IsOptional()
  @IsString({ message: 'campaignCode metni olmalıdır' })
  campaignCode?: string;
}
