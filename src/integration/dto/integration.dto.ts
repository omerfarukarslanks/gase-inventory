import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { IntegrationProvider, IntegrationStatus } from '../entities/integration-connection.entity';

export class CreateIntegrationConnectionDto {
  @ApiProperty({ enum: IntegrationProvider, description: 'Entegrasyon sağlayıcısı' })
  @IsEnum(IntegrationProvider)
  provider: IntegrationProvider;

  @ApiProperty({ example: 'Trendyol Mağaza 1', description: 'Bağlantı adı' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'API anahtarları ve bağlantı parametreleri (JSON)' })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class UpdateIntegrationConnectionDto {
  @ApiPropertyOptional({ example: 'Trendyol Mağaza 2' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: 'Güncellenmiş bağlantı parametreleri' })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;

  @ApiPropertyOptional({ enum: IntegrationStatus })
  @IsOptional()
  @IsEnum(IntegrationStatus)
  status?: IntegrationStatus;
}
