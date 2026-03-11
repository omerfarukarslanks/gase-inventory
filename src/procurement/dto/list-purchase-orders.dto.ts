import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { PurchaseOrderStatus } from '../entities/purchase-order.entity';

export type ActiveFilter = boolean | 'all';

export class ListPurchaseOrdersDto {
  @ApiPropertyOptional({ minimum: 1, description: 'Sayfa numarası (verilmezse tüm kayıtlar)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, description: 'Sayfa başına kayıt' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: PurchaseOrderStatus, description: 'Durum filtresi' })
  @IsOptional()
  @IsEnum(PurchaseOrderStatus)
  status?: PurchaseOrderStatus;

  @ApiPropertyOptional({ description: 'Mağaza ID filtresi' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ description: 'Tedarikçi ID filtresi' })
  @IsOptional()
  @IsUUID('4')
  supplierId?: string;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 20);
  }
}
