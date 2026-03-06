import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { SortOrder } from 'src/common/dto/pagination.dto';
import { PaginatedResponseDto } from 'src/common/dto/paginated-response.dto';
import { Supplier } from '../supplier.entity';

export enum ListSuppliersSortBy {
  ID = 'id',
  NAME = 'name',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export { SortOrder };
export type ActiveFilter = boolean | 'all';

export class ListSuppliersQueryDto {
  @ApiPropertyOptional({
    description: 'Sayfa numarası (verilmezse tüm kayıtlar döner)',
    minimum: 1,
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'Sayfa başına düşen kayıt sayısı (verilmezse tüm kayıtlar döner)',
    minimum: 1,
    maximum: 100,
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ description: 'Arama sorgusu (ad, soyad, telefon, e-posta)', type: String })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sıralama düzeni',
    enum: SortOrder,
    default: SortOrder.DESC,
  })
  @IsEnum(SortOrder)
  @IsOptional()
  sortOrder?: SortOrder = SortOrder.DESC;

  @ApiPropertyOptional({
    description: 'Sıralama alanı',
    enum: ListSuppliersSortBy,
    default: ListSuppliersSortBy.CREATED_AT,
  })
  @IsEnum(ListSuppliersSortBy)
  @IsOptional()
  sortBy?: ListSuppliersSortBy = ListSuppliersSortBy.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Aktiflik filtresi (true, false, all)',
    example: 'all',
    enum: ['all', true, false],
  })
  @Transform(({ value }) => {
    if (value === 'all') return 'all';
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsIn(['all', true, false])
  @IsOptional()
  isActive?: ActiveFilter;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 10);
  }
}

export class PaginatedSuppliersResponse extends PaginatedResponseDto<Supplier> {
  @ApiProperty({ type: [Supplier] })
  declare data: Supplier[];
}
