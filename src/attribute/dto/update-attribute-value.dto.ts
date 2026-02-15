import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAttributeValueDto {
  @ApiProperty({ example: 'Turuncu', description: 'Guncellenecek mevcut ad' })
  @IsString()
  @IsNotEmpty()
  currentName: string;

  @ApiProperty({ example: 1, description: 'Guncellenecek mevcut deger' })
  @Type(() => Number)
  @IsInt()
  currentValue: number;

  @ApiPropertyOptional({ example: 'Bordo', description: 'Yeni ad' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 2, description: 'Yeni deger' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  value?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
