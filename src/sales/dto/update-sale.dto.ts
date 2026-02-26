import { ApiPropertyOptional } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import {
  IsObject,
  IsOptional,
  IsUUID,
} from 'class-validator';

/**
 * Fiş üstü bilgileri günceller.
 * Satır değişiklikleri için /sales/:id/lines alt kaynağını kullanın:
 *   POST   /sales/:id/lines           — yeni satır ekle
 *   PATCH  /sales/:id/lines/:lineId   — satırı güncelle
 *   DELETE /sales/:id/lines/:lineId   — satırı sil
 */
export class UpdateSaleDto {
  @ApiPropertyOptional({
    description: 'Musteri ID (null gonderilirse iliski kaldirilir)',
    example: '08443723-dd00-49d2-969b-c27e579178dc',
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4', { message: 'customerId gecerli bir UUID olmalidir' })
  customerId?: string | null;

  @ApiPropertyOptional({
    description: 'Dinamik satis meta bilgileri',
    example: { source: 'POS', note: 'Musteri talebi ile guncellendi' },
  })
  @IsOptional()
  @IsObject({ message: 'meta object olmalidir' })
  meta?: Record<string, any>;
}
