import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import { CreateSaleLineDto } from './create-sale-line.dto';
import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSaleDto {
  @ApiPropertyOptional({ description: 'Satış yapılacak mağaza ID (gönderilmezse token/context storeId kullanılır)' })
  @IsOptional()
  @IsUUID('4', { message: 'storeId geçerli bir UUID olmalıdır' })
  storeId?: string;

  @ApiProperty({ description: 'Müşteri adı', example: 'Ahmet' })
  @IsString({ message: 'name metni olmalıdır' })
  @IsNotEmpty({ message: 'name boş olamaz' })
  name: string;

  @ApiProperty({ description: 'Müşteri soyadı', example: 'Yılmaz' })
  @IsString({ message: 'surname metni olmalıdır' })
  @IsNotEmpty({ message: 'surname boş olamaz' })
  surname: string;

  @ApiPropertyOptional({ description: 'Müşteri telefon numarası', example: '+905301234567' })
  @IsOptional()
  @IsString({ message: 'phoneNumber metni olmalıdır' })
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'Müşteri e-posta adresi', example: 'ahmet.yilmaz@example.com' })
  @IsOptional()
  @IsString({ message: 'email metni olmalıdır' })
  @IsEmail({}, { message: 'email geçerli bir e-posta olmalıdır' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Dinamik satış meta bilgileri',
    example: { source: 'POS', note: 'Hızlı teslimat' },
  })
  @IsOptional()
  @IsObject({ message: 'meta object olmalıdır' })
  meta?: Record<string, any>;

  @ApiProperty({
    type: [CreateSaleLineDto],
    description: 'Satış satırları listesi',
  })
  @IsNotEmpty({ message: 'lines boş olamaz' })
  lines: CreateSaleLineDto[];
}
