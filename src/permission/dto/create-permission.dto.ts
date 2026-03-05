import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty({
    example: 'REPORT_EXPORT',
    description: 'Yetki adı — büyük harf, alt çizgi kullanın (örn: STOCK_READ)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'name yalnızca büyük harf, rakam ve alt çizgi içerebilir (örn: STOCK_READ)',
  })
  name: string;

  @ApiPropertyOptional({ example: 'Raporları dışa aktar', description: 'Açıklama' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Raporlar', description: 'UI gruplandırma etiketi' })
  @IsOptional()
  @IsString()
  group?: string;

  @ApiPropertyOptional({ example: true, default: true, description: 'Yetki aktif mi?' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
