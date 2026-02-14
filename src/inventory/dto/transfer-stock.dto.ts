import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export class TransferStockDto {
  @ApiProperty({ description: 'Kaynak magaza ID' })
  @IsUUID('4', { message: 'fromStoreId gecerli bir UUID olmalidir' })
  @IsNotEmpty({ message: 'fromStoreId bos olamaz' })
  fromStoreId: string;

  @ApiProperty({ description: 'Hedef magaza ID' })
  @IsUUID('4', { message: 'toStoreId gecerli bir UUID olmalidir' })
  @IsNotEmpty({ message: 'toStoreId bos olamaz' })
  toStoreId: string;

  @ApiProperty({ description: 'Transfer edilecek urun varyant ID' })
  @IsUUID('4', { message: 'productVariantId gecerli bir UUID olmalidir' })
  @IsNotEmpty({ message: 'productVariantId bos olamaz' })
  productVariantId: string;

  @ApiProperty({ example: 10, description: 'Transfer miktari (> 0)' })
  @IsNumber({}, { message: 'quantity sayi olmalidir' })
  @IsPositive({ message: 'quantity pozitif olmalidir' })
  quantity: number;

  @ApiPropertyOptional({ example: 'TRF-2025-001' })
  @IsOptional()
  @IsString({ message: 'reference metni olmalidir' })
  reference?: string;

  @ApiPropertyOptional({
    example: { note: 'Merkez depodan sube 1e transfer' },
  })
  @IsOptional()
  @IsObject({ message: 'meta nesne olmalidir' })
  meta?: Record<string, any>;
}
