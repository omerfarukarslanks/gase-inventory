import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger/dist/decorators/api-property.decorator";
import { IsString, IsUUID, IsPositive, IsIn, IsNumber,IsNotEmpty, IsOptional } from "class-validator";

export class CreateSaleLineDto {
  @ApiProperty({ description: 'Satılan ürün varyant ID' })
  @IsUUID('4', { message: 'productVariantId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'productVariantId boş olamaz' })
  productVariantId: string;

  @ApiProperty({ description: 'Satılan miktar (> 0)' })
  @IsNotEmpty({ message: 'quantity boş olamaz' })
  @IsPositive({ message: 'quantity pozitif olmalıdır' })
  quantity: number;

  @ApiPropertyOptional({ description: 'Para birimi', example: 'TRY' })
  @IsOptional()
  @IsIn(['TRY', 'USD', 'EUR'], { message: 'currency geçerli bir para birimi olmalıdır' })
  currency?: string;

  @ApiPropertyOptional({ description: 'Birim fiyat', example: 299.9 })
  @IsOptional()
  @IsPositive({ message: 'unitPrice pozitif olmalıdır' })
  @IsNumber()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'İndirim yüzdesi', example: 15 })
  @IsOptional()
  @IsNumber()
  discountPercent?: number;

  @ApiPropertyOptional({ description: 'İndirim tutarı', example: 45 })
  @IsOptional()
  @IsNumber()
  discountAmount?: number;

  @ApiPropertyOptional({ description: 'KDV yüzdesi', example: 18 })
  @IsOptional()
  @IsNumber()
  taxPercent?: number;

  @ApiPropertyOptional({ description: 'KDV tutarı', example: 54 })
  @IsOptional()
  @IsNumber()
  taxAmount?: number;

  @ApiPropertyOptional({ description: 'Satış satırı toplam tutarı', example: 1200 })
  @IsOptional()
  @IsNumber()
  lineTotal?: number;

  @ApiPropertyOptional({ description: 'Kampanya kodu', example: 'CAMP-SUMMER2025' })
  @IsOptional()
  @IsString({ message: 'campaignCode metni olmalıdır' })
  campaignCode?: string;
}
