import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, ArrayUnique } from 'class-validator';

export class UpdateRoleDto {
  @ApiProperty({
    type: [String],
    example: ['STOCK_READ', 'SALE_CREATE'],
    description:
      'Rolün sahip olacağı tüm yetki adları. Mevcut tüm yetkiler bu listeyle değiştirilir. Boş dizi göndererek tüm yetkiler kaldırılabilir.',
  })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissionNames: string[];

  @ApiPropertyOptional({ example: true, description: 'Rolü aktif / pasif yap' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
