import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class SetStorePriceDto {
  @ApiPropertyOptional({
    description: 'Tek mağaza hedefi (storeIds gönderilmiyorsa kullanılır)',
    example: '08443723-dd00-49d2-969b-c27e579178dc',
  })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({
    description: 'Mağazaya özel birim satış fiyatı. null/boş ise tenant default kullanılır.',
    example: 150,
  })
  @IsOptional()
  @IsNumber()
  unitPrice?: number | null;

  @ApiPropertyOptional({
    description: 'Para birimi',
    example: 'TRY',
  })
  @IsOptional()
  @IsIn(['TRY', 'USD', 'EUR'])
  currency?: string;

  @ApiPropertyOptional({
    description: 'Mağazaya özel indirim yüzdesi (0-100)',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number | null;

  @ApiPropertyOptional({
    description: 'Mağazaya özel indirim tutarı',
    example: 50,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number | null;

  @ApiPropertyOptional({
    description: 'Mağazaya özel vergi yüzdesi (0+)',
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxPercent?: number | null;

  @ApiPropertyOptional({
    description: 'Mağazaya özel vergi tutarı',
    example: 100,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  taxAmount?: number | null;

  @ApiPropertyOptional({
    description: 'Satır toplam tutarı',
    example: 1200,
  })
  @IsOptional()
  @IsNumber()
  lineTotal?: number | null;

  @ApiPropertyOptional({
    description: 'Kampanya kodu',
    example: 'CAMP-NEWYEAR',
  })
  @IsOptional()
  @IsString()
  campaignCode?: string;

  @ApiPropertyOptional({
    description: 'Belirtilen mağazalara toplu uygulama',
    type: [String],
    example: [
      '08443723-dd00-49d2-969b-c27e579178dc',
      '1292efb0-ca75-4951-9641-8a75f47cf015',
    ],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  storeIds?: string[];

  @ApiPropertyOptional({
    description: 'true ise tenant içindeki tüm aktif mağazalara uygular',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  applyToAllStores?: boolean;
}
