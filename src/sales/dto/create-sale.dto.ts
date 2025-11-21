import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import { CreateSaleLineDto } from './create-sale-line.dto';
import { IsEmail, IsNotEmpty, IsUUID, IsString, IsOptional } from 'class-validator';

export class CreateSaleDto {
  @ApiProperty({ description: 'Satış yapılacak mağaza ID' })
  @IsUUID('4', { message: 'storeId geçerli bir UUID olmalıdır' })
  @IsNotEmpty({ message: 'storeId boş olamaz' })
  storeId: string;

  @ApiPropertyOptional({ description: 'Müşteri adı' , example: 'Ahmet Yılmaz' })
  @IsOptional()
  @IsString({ message: 'customerName metni olmalıdır' })
  customerName?: string;

  @ApiPropertyOptional({ description: 'Müşteri telefon numarası', example: '+905301234567' })
  @IsOptional()
  @IsString({ message: 'customerPhone metni olmalıdır' })
  customerPhone?: string;

  @ApiPropertyOptional({ description: 'Müşteri e-posta adresi', example: 'ahmet.yilmaz@example.com' })
  @IsOptional()
  @IsString({ message: 'customerEmail metni olmalıdır' })
  @IsEmail({}, { message: 'customerEmail geçerli bir e-posta olmalıdır' })
  customerEmail?: string;

  @ApiPropertyOptional({ description: 'Not', example: 'Hızlı teslimat' })
  @IsOptional()
  @IsString({ message: 'note metni olmalıdır' })
  note?: string;

  @ApiProperty({
    type: [CreateSaleLineDto],
    description: 'Satış satırları listesi',
  })
  @IsNotEmpty({ message: 'lines boş olamaz' })
  lines: CreateSaleLineDto[];
}
