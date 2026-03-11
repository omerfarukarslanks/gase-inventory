import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetChangesQueryDto {
  /**
   * Son alınan cursor (ISO 8601 timestamp).
   * Belirtilmezse son 7 günün event'leri döner.
   */
  @ApiPropertyOptional({
    example: '2025-01-01T00:00:00.000Z',
    description: 'Son senkronizasyon zamanı (ISO 8601). İlk çekimde boş bırakın.',
  })
  @IsOptional()
  @IsISO8601()
  since?: string;

  /**
   * Sadece belirli event tiplerini filtrele.
   * Virgülle ayrılmış, ör: `goods_receipt.created,sale.created`
   */
  @ApiPropertyOptional({
    example: 'goods_receipt.created,sale.created',
    description: 'Filtrelenecek event tipleri (virgülle ayrılmış)',
  })
  @IsOptional()
  @IsString()
  types?: string;

  @ApiPropertyOptional({ example: 100, description: 'Maksimum event sayısı (1-500)', default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
