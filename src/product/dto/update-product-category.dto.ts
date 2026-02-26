import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateProductCategoryDto {
  @ApiPropertyOptional({ example: 'Elektronik v2' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: 'elektronik-v2' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Üst kategori ID — null gönderilirse kök yapılır' })
  @IsUUID()
  @IsOptional()
  parentId?: string | null;
}
