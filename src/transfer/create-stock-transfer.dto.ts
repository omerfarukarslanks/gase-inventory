// src/transfer/dto/create-stock-transfer.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsUUID, ValidateNested, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStockTransferLineDto {
  @ApiProperty({ description: 'Transfer edilecek ürün varyant ID' })
  @IsUUID()
  productVariantId: string;

  @ApiProperty({ description: 'Transfer miktarı', example: 10 })
  @IsNumber()
  @Min(0.001)
  quantity: number;
}

export class CreateStockTransferDto {
  @ApiProperty({ description: 'Gönderen mağaza ID' })
  @IsUUID()
  fromStoreId: string;

  @ApiProperty({ description: 'Teslim alan mağaza ID' })
  @IsUUID()
  toStoreId: string;

  @ApiPropertyOptional({ description: 'Referans / belge numarası', example: 'TRF-2025-0001' })
  reference?: string;

  @ApiPropertyOptional({ description: 'Not', example: 'Depo arası transfer' })
  note?: string;

  @ApiProperty({
    type: [CreateStockTransferLineDto],
    description: 'Transfer satırları',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateStockTransferLineDto)
  lines: CreateStockTransferLineDto[];
}
