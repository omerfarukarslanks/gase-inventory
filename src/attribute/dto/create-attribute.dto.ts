import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateAttributeDto {
  @ApiProperty({ example: 'Renk', description: 'Attribute adi' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
