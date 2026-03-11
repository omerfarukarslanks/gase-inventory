import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ListAuditLogsDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Entity türü filtresi — örn: PurchaseOrder' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  entityType?: string;

  @ApiPropertyOptional({ description: 'Entity UUID filtresi' })
  @IsOptional()
  @IsUUID('4')
  entityId?: string;

  @ApiPropertyOptional({ description: 'İşlem kodu filtresi — örn: PO_APPROVED' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  action?: string;

  @ApiPropertyOptional({ description: 'Kullanıcı UUID filtresi' })
  @IsOptional()
  @IsUUID('4')
  userId?: string;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 20);
  }
}
