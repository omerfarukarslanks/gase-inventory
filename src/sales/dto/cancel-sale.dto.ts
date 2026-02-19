import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional } from 'class-validator';

export class CancelSaleDto {
  @ApiPropertyOptional({
    description: 'Iptal islemi icin meta bilgisi',
    example: { reason: 'Musteri vazgecti', note: 'Telefon ile iptal' },
  })
  @IsOptional()
  @IsObject({ message: 'meta object olmalidir' })
  meta?: Record<string, any>;
}
