import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, IsUUID, Min } from 'class-validator';

export class CreateReplenishmentRuleDto {
  @ApiProperty({ description: 'Mağaza ID' })
  @IsUUID('4')
  storeId: string;

  @ApiProperty({ description: 'Ürün varyantı ID' })
  @IsUUID('4')
  productVariantId: string;

  @ApiProperty({ description: 'Minimum stok eşiği — bu değerin altına düşünce öneri üret' })
  @IsNumber()
  @Min(0)
  minStock: number;

  @ApiProperty({ description: 'Hedef stok — sipariş edilen miktar = targetStock - currentQty' })
  @IsNumber()
  @IsPositive()
  targetStock: number;

  @ApiPropertyOptional({ description: 'Tedarikçi ID (PO oluştururken kullanılır)' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  @ApiPropertyOptional({ description: 'Temin süresi (gün)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  leadTimeDays?: number;
}
