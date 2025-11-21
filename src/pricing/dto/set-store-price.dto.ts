import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional } from 'class-validator';

export class SetStorePriceDto {
  @ApiPropertyOptional({
    description: 'Mağazaya özel satış fiyatı (birim fiyat). null veya boş bırakılırsa override pasif olur.',
    example: 299.9,
  })
  @IsOptional()
  @IsNumber()
  salePrice?: number | null;

  @ApiPropertyOptional({
    description: 'Mağazaya özel vergi yüzdesi (örn: 20.00). Boşsa tenant varsayılanı kullanılır.',
    example: 20,
  })
  @IsOptional()
  @IsNumber()
  taxPercent?: number | null;

  @ApiPropertyOptional({
    description: 'Mağazaya özel indirim yüzdesi (örn: 10.00). Boşsa indirim yok.',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  discountPercent?: number | null;

  @ApiPropertyOptional({
    description: 'Para birimi (örn: TRY, USD). Boşsa variant defaultCurrency kullanılır.',
    example: 'TRY',
  })
  @IsOptional()
  currency?: string;
}
