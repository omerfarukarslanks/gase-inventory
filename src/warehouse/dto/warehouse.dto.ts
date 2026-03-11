import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { LocationType } from '../entities/location.entity';

export class CreateWarehouseDto {
  @ApiProperty({ description: 'Deponun bağlı olduğu mağaza ID' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId: string;

  @ApiProperty({ example: 'Ana Depo', description: 'Depo adı' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Depo adresi' })
  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ example: 'Ana Depo', description: 'Depo adı' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Depo adresi' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ description: 'Aktif/pasif durumu' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateLocationDto {
  @ApiProperty({ description: 'Depo ID' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ example: 'A-01-B1', description: 'Lokasyon kodu' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'Raf A1 — Bölme 1', description: 'Lokasyon adı' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: LocationType, description: 'Lokasyon tipi' })
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;
}

export class UpdateLocationDto {
  @ApiPropertyOptional({ description: 'Lokasyon kodu' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ description: 'Lokasyon adı' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ enum: LocationType })
  @IsOptional()
  @IsEnum(LocationType)
  type?: LocationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateCountSessionDto {
  @ApiProperty({ description: 'Sayımın yapılacağı mağaza ID' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId: string;

  @ApiPropertyOptional({ description: 'Sayımın yapılacağı depo ID (opsiyonel)' })
  @IsOptional()
  @IsUUID('4')
  warehouseId?: string;

  @ApiPropertyOptional({ description: 'Notlar' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddCountLineDto {
  @ApiProperty({ description: 'Ürün varyant ID' })
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId: string;

  @ApiPropertyOptional({ description: 'Lot numarası' })
  @IsOptional()
  @IsString()
  lotNumber?: string;

  @ApiPropertyOptional({ description: 'Lokasyon ID' })
  @IsOptional()
  @IsUUID('4')
  locationId?: string;

  @ApiProperty({ description: 'Sistemin beklediği miktar (stok snapshot)' })
  @IsNumber()
  expectedQuantity: number;

  @ApiPropertyOptional({ description: 'Fiziksel sayım miktarı (sonradan girilebilir)' })
  @IsOptional()
  @IsNumber()
  countedQuantity?: number;
}

export class UpdateCountLineDto {
  @ApiProperty({ description: 'Fiziksel sayım miktarı' })
  @IsNumber()
  countedQuantity: number;
}
