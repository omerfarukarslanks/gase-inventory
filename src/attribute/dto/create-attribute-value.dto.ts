import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateAttributeValueDto {
  @ApiProperty({ example: 'Turuncu', description: 'Attribute value adi' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1, description: 'Attribute value degeri' })
  @Type(() => Number)
  @IsInt()
  value: number;
}
