import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class CreateGoodsReceiptLineDto {
  @ApiProperty({ description: 'İlgili sipariş kalemi ID' })
  @IsUUID('4')
  purchaseOrderLineId: string;

  @ApiProperty({ example: 20, description: 'Teslim alınan miktar' })
  @IsPositive()
  @IsNumber()
  receivedQuantity: number;

  @ApiPropertyOptional({ example: 'LOT-2026-001', description: 'Lot / parti numarası' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lotNumber?: string;

  @ApiPropertyOptional({ example: '2027-12-31', description: 'Son kullanma tarihi' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class CreateGoodsReceiptDto {
  @ApiProperty({ description: 'Mal kabulun yapilacagi depo ID' })
  @IsUUID('4')
  @IsNotEmpty()
  warehouseId: string;

  @ApiPropertyOptional({ description: 'Teslim alma notu' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ApiProperty({ type: [CreateGoodsReceiptLineDto], description: 'Teslim alınan kalemler' })
  @ValidateNested({ each: true })
  @Type(() => CreateGoodsReceiptLineDto)
  @ArrayMinSize(1, { message: 'En az 1 kalem gereklidir' })
  lines: CreateGoodsReceiptLineDto[];
}
