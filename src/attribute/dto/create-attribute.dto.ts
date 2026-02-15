import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString } from 'class-validator';

export class CreateAttributeDto {
  @ApiProperty({ example: 'Renk', description: 'Attribute adi' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 1, description: 'Attribute degeri' })
  @Type(() => Number)
  @IsInt()
  value: number;
}
