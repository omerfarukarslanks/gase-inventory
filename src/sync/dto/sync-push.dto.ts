import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Client'ın push edebileceği işlem tipleri.
 * Her tipe karşılık gelen `payload` şeması SyncPushService'te belgelenmiştir.
 */
export enum PushOperationType {
  /** Satış oluştur — payload: CreateSaleDto */
  CREATE_SALE     = 'CREATE_SALE',
  /** Stok düzelt — payload: AdjustStockItemDto */
  ADJUST_STOCK    = 'ADJUST_STOCK',
  /** Stok transferi — payload: TransferStockDto */
  TRANSFER_STOCK  = 'TRANSFER_STOCK',
}

export class PushOperationDto {
  /**
   * Client'ın bu operasyona verdiği tekil ID.
   * Idempotency-Key ile birlikte sunucuda tekrar işlemeyi önler.
   */
  @ApiProperty({ example: 'local-op-uuid-v4', description: 'Client tarafı operasyon ID (UUID v4)' })
  @IsUUID('4')
  operationId: string;

  @ApiProperty({ enum: PushOperationType })
  @IsEnum(PushOperationType)
  type: PushOperationType;

  /**
   * İşlem parametreleri — tip'e göre içerik değişir.
   * Örn. CREATE_SALE: { storeId, lines, customerId? }
   */
  @ApiProperty({ description: 'Operasyon parametreleri (tipe göre değişir)' })
  @IsObject()
  payload: Record<string, any>;

  /**
   * Client'ın işlem sırasındaki sunucu saat damgası (ISO 8601).
   * Conflict tespiti için kullanılır.
   * İlk sync'te veya bilgi yoksa göndermeyebilirsiniz.
   */
  @ApiPropertyOptional({ example: '2026-01-01T12:00:00.000Z' })
  @IsOptional()
  @IsString()
  clientTimestamp?: string;
}

export class SyncPushDto {
  @ApiProperty({ type: [PushOperationDto], description: 'Push edilecek operasyon listesi (maks. 50)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PushOperationDto)
  operations: PushOperationDto[];

  /**
   * Client'ın son başarılı pull cursor'ı.
   * Sunucu bu cursor'dan sonraki değişiklikleri conflict tespitinde kullanabilir.
   */
  @ApiPropertyOptional({ example: '2026-01-01T11:59:00.000Z' })
  @IsOptional()
  @IsString()
  lastSyncCursor?: string;
}

/** Tek operasyonun sonucu */
export type PushOperationResult =
  | {
      operationId: string;
      status: 'accepted';
      entityId?: string;
      serverTimestamp: string;
    }
  | {
      operationId: string;
      status: 'conflict';
      /** Sunucudaki güncel veri — client bu veriyle local state'i reconcile eder */
      serverVersion: Record<string, any>;
      message: string;
    }
  | {
      operationId: string;
      status: 'rejected';
      /** Neden reddedildi */
      reason: string;
    };

export interface SyncPushResult {
  results: PushOperationResult[];
  /** Conflict veya rejection sayısı */
  failedCount: number;
}
