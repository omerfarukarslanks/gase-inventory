import { ApiPropertyOptional } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { UpdateSaleLineDto } from './update-sale-line.dto';

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

  @ApiPropertyOptional({
    type: [UpdateSaleLineDto],
    description:
      'Satis satirlari (gonderilirse mevcut satirlar tamamen bu liste ile degistirilir)',
  })
  @IsOptional()
  @IsArray({ message: 'lines dizi olmalidir' })
  @ArrayMinSize(1, { message: 'lines en az bir satir icermelidir' })
  @ValidateNested({ each: true })
  @Type(() => UpdateSaleLineDto)
  lines?: UpdateSaleLineDto[];
}
