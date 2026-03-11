import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateCustomerGroupDto {
  @ApiProperty({ example: 'Toptan', description: 'Grup adı' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Açıklama' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCustomerGroupDto {
  @ApiPropertyOptional({ description: 'Grup adı' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Açıklama' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Aktif/pasif' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertCreditLimitDto {
  @ApiProperty({ example: 50000, description: 'Kredi limiti' })
  @IsNumber()
  @IsPositive()
  creditLimit: number;

  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 80, description: 'Uyarı eşiği (%)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  warningThresholdPercent?: number;
}

export class CreatePaymentTermDto {
  @ApiPropertyOptional({ description: 'Müşteri ID (müşteri bazlı kural)' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({ description: 'Müşteri grubu ID (grup bazlı kural)' })
  @IsOptional()
  @IsUUID('4')
  customerGroupId?: string;

  @ApiProperty({ example: 30, description: 'Ödeme günü sayısı (örn. 30 = Net 30)' })
  @IsInt()
  @IsPositive()
  netDays: number;

  @ApiPropertyOptional({ example: 10, description: 'Erken ödeme indirimi için gün penceresi' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  discountDays?: number;

  @ApiPropertyOptional({ example: 2, description: 'Erken ödeme iskonto yüzdesi' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Açıklama (örn. "2/10 Net 30")' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdatePaymentTermDto {
  @ApiPropertyOptional({ description: 'Ödeme günü sayısı' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  netDays?: number;

  @ApiPropertyOptional({ description: 'Erken ödeme gün penceresi' })
  @IsOptional()
  @IsInt()
  @IsPositive()
  discountDays?: number;

  @ApiPropertyOptional({ description: 'Erken ödeme iskonto yüzdesi' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'Açıklama' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Aktif/pasif' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertPriceListEntryDto {
  @ApiProperty({ description: 'Ürün varyant ID' })
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId: string;

  @ApiProperty({ example: 99.9, description: 'Grup fiyatı' })
  @IsNumber()
  @IsPositive()
  price: number;

  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '2025-01-01', description: 'Geçerlilik başlangıcı (ISO 8601)' })
  @IsOptional()
  @IsString()
  validFrom?: string;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59Z', description: 'Geçerlilik bitişi (ISO 8601)' })
  @IsOptional()
  @IsString()
  validUntil?: string;
}
