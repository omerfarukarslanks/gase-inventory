import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApprovalEntityType, ApprovalStatus } from '../entities/approval-request.entity';

// ── Stok düzeltme requestData yapısı ──────────────────────────────────────────
export interface StockAdjustmentRequestData {
  storeId: string;
  productVariantId: string;
  newQuantity: number;
}

// ── Fiyat override requestData yapısı ─────────────────────────────────────────
export interface PriceOverrideRequestData {
  storeId: string;
  productVariantId: string;
  newPrice: number;
  currency?: string;
  taxPercent?: number;
}

export interface PurchaseOrderRequestData {
  purchaseOrderId: string;
  totalAmount?: number;
  currency?: string;
  supplierId?: string;
}

export interface SaleReturnRequestData {
  saleReturnId: string;
  saleId?: string;
  totalRefundAmount?: number;
  lines?: Record<string, any>[];
}

export interface CountAdjustmentRequestData {
  countSessionId: string;
  storeId: string;
  lines: Record<string, any>[];
}

// ── DTOs ──────────────────────────────────────────────────────────────────────

export class CreateApprovalRequestDto {
  @ApiProperty({ enum: ApprovalEntityType })
  @IsEnum(ApprovalEntityType)
  entityType: ApprovalEntityType;

  @ApiProperty({ description: 'İşlemi uygulamak için gerekli parametreler (JSON)' })
  @IsObject()
  requestData: Record<string, any>;

  @ApiPropertyOptional({ description: 'Talep notu / gerekçe' })
  @IsOptional()
  @IsString()
  requesterNotes?: string;
}

export class ReviewApprovalDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'] })
  @IsEnum(['APPROVE', 'REJECT'])
  action: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Onay/ret notu' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListApprovalQueryDto {
  @ApiPropertyOptional({ enum: ApprovalStatus })
  @IsOptional()
  @IsEnum(ApprovalStatus)
  status?: ApprovalStatus;

  @ApiPropertyOptional({ enum: ApprovalEntityType })
  @IsOptional()
  @IsEnum(ApprovalEntityType)
  entityType?: ApprovalEntityType;
}
