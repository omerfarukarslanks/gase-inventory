import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class PriceFieldsDto {
  @ApiPropertyOptional({ example: 'TRY', description: 'Para birimi' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 100, description: 'Alis fiyati' })
  @IsNumber()
  @IsOptional()
  purchasePrice?: number;

  @ApiPropertyOptional({ example: 150, description: 'Satis birim fiyati' })
  @IsNumber()
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ example: 10, description: 'Indirim yuzdesi' })
  @IsNumber()
  @IsOptional()
  discountPercent?: number;

  @ApiPropertyOptional({ example: 50, description: 'Indirim tutari' })
  @IsNumber()
  @IsOptional()
  discountAmount?: number;

  @ApiPropertyOptional({ example: 20, description: 'Vergi yuzdesi' })
  @IsNumber()
  @IsOptional()
  taxPercent?: number;

  @ApiPropertyOptional({ example: 100, description: 'Vergi tutari' })
  @IsNumber()
  @IsOptional()
  taxAmount?: number;

  @ApiPropertyOptional({ example: 1200, description: 'Satir toplami' })
  @IsNumber()
  @IsOptional()
  lineTotal?: number;
}
