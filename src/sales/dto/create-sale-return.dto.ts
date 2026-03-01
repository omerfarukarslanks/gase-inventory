import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Paket satır iadelerinde: paketteki hangi varianttan kaç adet iade edildiğini belirtir.
 */
export class PackageVariantReturnItemDto {
  @ApiProperty({ description: 'İade edilecek variant ID (paket içindeki variant)' })
  @IsUUID()
  productVariantId: string;

  @ApiProperty({ example: 5, description: 'İade miktarı' })
  @IsNumber()
  @IsPositive()
  quantity: number;
}

export class CreateSaleReturnLineDto {
  @ApiProperty({ description: 'İade edilecek satır ID' })
  @IsUUID()
  saleLineId: string;

  /**
   * Perakende satır iadesi için: kaç adet variant iade ediliyor.
   * Paket satır iadesi için: ya bu alan (tüm paket birimleri) ya da
   * packageVariantReturns (varyant bazlı) kullanılır — ikisi aynı anda gönderilemez.
   */
  @ApiPropertyOptional({ example: 2, description: 'İade miktarı — perakende satırlar için zorunlu; paket satırlarda packageVariantReturns ile birlikte kullanılamaz' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  quantity?: number;

  /**
   * Paket satır iadesi için varyant bazlı iade detayı.
   * Tüm paket yerine paketteki belirli variantları belirtilen miktarda iade eder.
   * quantity ile birlikte kullanılamaz.
   */
  @ApiPropertyOptional({
    type: [PackageVariantReturnItemDto],
    description: 'Paket satır iadelerinde varyant bazlı miktar belirtimi — quantity ile birlikte kullanılamaz',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PackageVariantReturnItemDto)
  packageVariantReturns?: PackageVariantReturnItemDto[];

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
