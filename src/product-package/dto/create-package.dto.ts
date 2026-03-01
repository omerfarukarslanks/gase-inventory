import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePackageItemDto {
  @ApiProperty({ example: 'uuid', description: 'Paketteki variant ID\'si' })
  @IsUUID()
  productVariantId: string;

  @ApiProperty({ example: 10, description: 'Paket başına bu variantten kaç adet' })
  @IsNumber()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({ example: 100.00, description: 'Bu variantin paket içindeki birim fiyat katkısı (kısmi iade hesabı için)' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  unitPrice?: number;
}

export class CreatePackageDto {
  @ApiProperty({ example: 'Kıyafet Paketi S/M/L', description: 'Paket adı' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'PKG-001', description: 'Paket kodu (tenant içinde unique)' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'S, M, L bedenlerinden birer adet içerir' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    type: [CreatePackageItemDto],
    description: 'Paketin içerdiği variant listesi (en az 1 adet)',
  })
  @ValidateNested({ each: true })
  @Type(() => CreatePackageItemDto)
  @ArrayMinSize(1)
  items: CreatePackageItemDto[];
}
