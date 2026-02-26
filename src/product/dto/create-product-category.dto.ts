import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateProductCategoryDto {
  @ApiProperty({ example: 'Elektronik', description: 'Kategori adı' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'elektronik', description: 'URL-uyumlu slug' })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiPropertyOptional({ example: 'Tüm elektronik ürünler' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Üst kategori ID — yoksa kök kategori' })
  @IsUUID()
  @IsOptional()
  parentId?: string;
}
