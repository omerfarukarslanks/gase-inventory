import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class ProductAttributeSelectionDto {
  @ApiProperty({ description: 'Attribute ID' })
  @IsUUID('4')
  id: string;

  @ApiProperty({ type: [String], description: 'Attribute value ID listesi' })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  values: string[];
}
