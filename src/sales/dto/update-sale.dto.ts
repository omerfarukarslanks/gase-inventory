import { ApiPropertyOptional } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { UpdateSaleLineDto } from './update-sale-line.dto';

export class UpdateSaleDto {
  @ApiPropertyOptional({ description: 'Musteri adi', example: 'Ahmet' })
  @IsOptional()
  @IsString({ message: 'name metni olmalidir' })
  @IsNotEmpty({ message: 'name bos olamaz' })
  name?: string;

  @ApiPropertyOptional({ description: 'Musteri soyadi', example: 'Yilmaz' })
  @IsOptional()
  @IsString({ message: 'surname metni olmalidir' })
  @IsNotEmpty({ message: 'surname bos olamaz' })
  surname?: string;

  @ApiPropertyOptional({
    description: 'Musteri telefon numarasi',
    example: '+905301234567',
  })
  @IsOptional()
  @IsString({ message: 'phoneNumber metni olmalidir' })
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Musteri e-posta adresi',
    example: 'ahmet.yilmaz@example.com',
  })
  @IsOptional()
  @IsString({ message: 'email metni olmalidir' })
  @IsEmail({}, { message: 'email gecerli bir e-posta olmalidir' })
  email?: string;

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
