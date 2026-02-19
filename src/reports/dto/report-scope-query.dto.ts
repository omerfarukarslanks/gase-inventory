import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  IsNumber,
} from 'class-validator';
import { MovementType } from 'src/inventory/inventory-movement.entity';

export class ReportScopeQueryDto {
  @ApiPropertyOptional({
    description:
      'Coklu magazaya gore filtre. context storeId varsa bu alan ignore edilir.',
    type: [String],
    example: [
      '08443723-dd00-49d2-969b-c27e579178dc',
      '1292efb0-ca75-4951-9641-8a75f47cf015',
    ],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value == null || value === '') {
      return undefined;
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => String(item).trim())
        .filter(Boolean);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    return undefined;
  })
  @IsArray()
  @IsUUID('4', { each: true })
  storeIds?: string[];

  @ApiPropertyOptional({ description: 'Sayfa numarasi (1 tabanli)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Sayfa basina kayit', maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Baslangic tarihi (ISO), or: 2026-02-01',
    example: '2026-02-01',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({
    description: 'Bitis tarihi (ISO), or: 2026-02-28',
    example: '2026-02-28',
  })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({
    description:
      'Karsilastirma tarihi (bu tarih ile bugun arasindaki artis/azalis yuzdesi hesaplanir)',
    example: '2026-02-10',
  })
  @IsOptional()
  @IsString()
  compareDate?: string;

  @ApiPropertyOptional({
    description: 'Arama metni (urun/varyant/magaza)',
    example: 'pantolon',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ description: 'Dusuk stok esigi', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  threshold?: number;

  @ApiPropertyOptional({
    description: 'Hareket tipi filtresi',
    enum: MovementType,
  })
  @IsOptional()
  @IsEnum(MovementType)
  movementType?: MovementType;

  @ApiPropertyOptional({
    description: 'Varyant filtresi',
    example: 'c8f403f3-6445-463f-9c2b-898a531b9984',
  })
  @IsOptional()
  @IsUUID('4')
  productVariantId?: string;

  @ApiPropertyOptional({ description: 'Fis no filtresi', example: 'SF-20260218' })
  @IsOptional()
  @IsString()
  receiptNo?: string;

  @ApiPropertyOptional({ description: 'Musteri adi filtresi', example: 'Aziz' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Musteri soyadi filtresi', example: 'Kocakaya' })
  @IsOptional()
  @IsString()
  surname?: string;

  @ApiPropertyOptional({ description: 'Siparis lineTotal alt limiti', example: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minLinePrice?: number;

  @ApiPropertyOptional({ description: 'Siparis lineTotal ust limiti', example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxLinePrice?: number;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }
}
