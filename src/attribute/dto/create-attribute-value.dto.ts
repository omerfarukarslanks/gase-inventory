import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAttributeValueDto {
  @ApiProperty({ example: 'Turuncu', description: 'Attribute value adi' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
