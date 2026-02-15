import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAttributeDto {
  @ApiProperty({ example: 'Renk', description: 'Guncellenecek attribute adi' })
  @IsString()
  @IsNotEmpty()
  currentName: string;

  @ApiPropertyOptional({ example: 1, description: 'Guncellenecek attribute degeri' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  currentValue?: number;

  @ApiPropertyOptional({ example: 'Renk Yeni', description: 'Yeni attribute adi' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 2, description: 'Yeni attribute degeri' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
