import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreatePurchaseOrderLineDto {
  @ApiProperty({ description: 'Ürün varyant ID' })
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId: string;

  @ApiProperty({ example: 50, description: 'Sipariş edilen miktar' })
  @IsPositive()
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional({ example: 120.5, description: 'Birim alış fiyatı (KDV hariç)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;

  @ApiPropertyOptional({ example: 20, description: 'KDV oranı (%)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'Satır notu' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty({ description: 'Stok girişi yapılacak mağaza ID' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId: string;

  @ApiPropertyOptional({ description: 'Tedarikçi ID (opsiyonel)' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ example: '2026-04-01', description: 'Beklenen teslim tarihi' })
  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi (varsayılan: TRY)' })
  @IsOptional()
  @IsIn(['TRY', 'USD', 'EUR'])
  currency?: string;

  @ApiPropertyOptional({ description: 'Sipariş notu' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ type: [CreatePurchaseOrderLineDto], description: 'Sipariş kalemleri' })
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderLineDto)
  @ArrayMinSize(1, { message: 'En az 1 kalem gereklidir' })
  lines: CreatePurchaseOrderLineDto[];
}
