import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RemoveAttributeDto {
  @ApiProperty({ example: 'Renk', description: 'Pasife alinacak attribute adi' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 1, description: 'Pasife alinacak attribute degeri' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  value?: number;
}
