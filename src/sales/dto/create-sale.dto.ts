import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger/dist/decorators/api-property.decorator';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateSaleLineDto } from './create-sale-line.dto';
import { AddPaymentDto } from './add-payment.dto';

export class CreateSaleDto {
  @ApiPropertyOptional({ description: 'Satış yapılacak mağaza ID (gönderilmezse token/context storeId kullanılır)' })
  @IsOptional()
  @IsUUID('4', { message: 'storeId geçerli bir UUID olmalıdır' })
  storeId?: string;

  @ApiPropertyOptional({ description: 'Müşteri ID', example: '08443723-dd00-49d2-969b-c27e579178dc' })
  @IsOptional()
  @IsUUID('4', { message: 'customerId geçerli bir UUID olmalıdır' })
  customerId?: string;

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

  @ApiPropertyOptional({
    type: AddPaymentDto,
    description:
      'Fiş oluşturulurken aynı anda ödeme kaydı açmak için (opsiyonel). ' +
      'Gönderilmezse fiş UNPAID olarak açılır.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddPaymentDto)
  initialPayment?: AddPaymentDto;
}
