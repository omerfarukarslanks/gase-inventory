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

// ---- Putaway Tasks ----

export class CreatePutawayTaskDto {
  @ApiProperty({ description: 'Depo ID' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ description: 'Yerleştirilecek ürün varyant ID' })
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId: string;

  @ApiProperty({ description: 'Miktar', example: 20 })
  @IsNumber()
  quantity: number;

  @ApiProperty({ description: 'Hedef lokasyon ID' })
  @IsUUID('4')
  @IsNotEmpty()
  toLocationId: string;

  @ApiPropertyOptional({ description: 'İlgili mal kabul belgesi ID' })
  @IsOptional()
  @IsUUID('4')
  goodsReceiptId?: string;

  @ApiPropertyOptional({ description: 'Notlar' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignPutawayTaskDto {
  @ApiProperty({ description: 'Göreve atanacak kullanıcı ID' })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;
}

// ---- Wave ----

export class CreateWaveDto {
  @ApiProperty({ description: 'Depo ID' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ example: 'WAVE-20260311-001', description: 'Wave kodu' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ description: 'Notlar' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// ---- Picking Tasks ----

export class CreatePickingTaskDto {
  @ApiProperty({ description: 'Depo ID' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ description: 'Toplanacak ürün varyant ID' })
  @IsUUID('4')
  @IsNotEmpty()
  productVariantId: string;

  @ApiProperty({ description: 'İstenen miktar', example: 5 })
  @IsNumber()
  requestedQuantity: number;

  @ApiProperty({ description: 'Kaynak lokasyon ID' })
  @IsUUID('4')
  @IsNotEmpty()
  fromLocationId: string;

  @ApiPropertyOptional({ description: 'İlgili satış ID' })
  @IsOptional()
  @IsUUID('4')
  saleId?: string;

  @ApiPropertyOptional({ description: 'Wave ID (batch picking için)' })
  @IsOptional()
  @IsUUID('4')
  waveId?: string;

  @ApiPropertyOptional({ description: 'Notlar' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CompletePickingTaskDto {
  @ApiProperty({ description: 'Fiilen toplanan miktar', example: 5 })
  @IsNumber()
  pickedQuantity: number;
}

export class AssignPickingTaskDto {
  @ApiProperty({ description: 'Göreve atanacak kullanıcı ID' })
  @IsUUID('4')
  @IsNotEmpty()
  userId: string;
}
