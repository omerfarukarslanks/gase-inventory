import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { ProductAttributeSelectionDto } from './product-attribute-selection.dto';

export class CreateVariantDto {
  @ApiProperty({
    type: [ProductAttributeSelectionDto],
    description: 'Varyantlari olusturmak icin attribute/value secimleri',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProductAttributeSelectionDto)
  attributes: ProductAttributeSelectionDto[];
}
