import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePermissionDto {
  @ApiPropertyOptional({ example: 'Raporları dışa aktar', description: 'Yeni açıklama' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Raporlar', description: 'Yeni grup etiketi' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional({ example: true, description: 'Yetkiyi aktif / pasif yap' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
