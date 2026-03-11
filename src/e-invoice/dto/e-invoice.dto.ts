import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
} from 'class-validator';
import { EInvoiceStatus, EInvoiceType } from '../entities/e-invoice.entity';

export class CreateEInvoiceDto {
  @ApiProperty({ enum: EInvoiceType, description: 'Fatura türü (e-Fatura veya e-Arşiv)' })
  @IsEnum(EInvoiceType)
  type: EInvoiceType;

  @ApiProperty({ example: 'GBS2026000000001', description: 'Belge seri/sıra numarası (maks. 30 karakter)' })
  @IsString()
  @IsNotEmpty()
  @Length(1, 30)
  documentNo: string;

  @ApiProperty({ example: '1234567890', description: 'Düzenleyici VKN (10 hane)' })
  @IsString()
  @Length(10, 11)
  issuerVkn: string;

  @ApiPropertyOptional({ example: '9876543210', description: 'Alıcı VKN (tüzel kişi)' })
  @IsOptional()
  @IsString()
  @Length(10, 10)
  receiverVkn?: string;

  @ApiPropertyOptional({ example: '12345678901', description: 'Alıcı TCKN (gerçek kişi)' })
  @IsOptional()
  @IsString()
  @Length(11, 11)
  receiverTckn?: string;

  @ApiPropertyOptional({ example: 'Ahmet Yılmaz', description: 'Alıcı adı / ticaret unvanı' })
  @IsOptional()
  @IsString()
  receiverName?: string;
}

export class ListEInvoicesQueryDto {
  @ApiPropertyOptional({ enum: EInvoiceStatus })
  @IsOptional()
  @IsEnum(EInvoiceStatus)
  status?: EInvoiceStatus;

  @ApiPropertyOptional({ enum: EInvoiceType })
  @IsOptional()
  @IsEnum(EInvoiceType)
  type?: EInvoiceType;
}
