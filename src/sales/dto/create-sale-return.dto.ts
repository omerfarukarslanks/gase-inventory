import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSaleReturnLineDto {
  @ApiProperty({ description: 'İade edilecek satır ID' })
  @IsUUID()
  saleLineId: string;

  @ApiProperty({ example: 2, description: 'İade miktarı (orijinal miktarı geçemez)' })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 150, description: 'Bu satır için iade tutarı (belirtilmezse 0)' })
  @IsNumber()
  @IsOptional()
  refundAmount?: number;
}

export class CreateSaleReturnDto {
  @ApiProperty({
    type: [CreateSaleReturnLineDto],
    description: 'İade edilecek satırlar ve miktarlar',
  })
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnLineDto)
  @ArrayMinSize(1)
  lines: CreateSaleReturnLineDto[];

  @ApiPropertyOptional({ example: 'Müşteri vazgeçti' })
  @IsString()
  @IsOptional()
  notes?: string;
}
