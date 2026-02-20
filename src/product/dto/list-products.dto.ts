import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto, SortOrder } from 'src/common/dto/pagination.dto';
import { PaginatedResponseDto } from 'src/common/dto/paginated-response.dto';
import { Product } from '../product.entity';

export enum ListProductsSortBy {
  ID = 'id',
  NAME = 'name',
  SKU = 'sku',
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
}

export { SortOrder };
export type ActiveFilter = boolean | 'all';

export class ListProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Sıralama alanı',
    enum: ListProductsSortBy,
    default: ListProductsSortBy.CREATED_AT,
  })
  @IsEnum(ListProductsSortBy)
  @IsOptional()
  sortBy?: string = ListProductsSortBy.CREATED_AT;

  @ApiPropertyOptional({
    description: 'Ürün para birimi filtresi (örn: TRY, USD)',
    example: 'TRY',
  })
  @IsString()
  @IsOptional()
  defaultCurrency?: string;

  @ApiPropertyOptional({
    description: 'Satış fiyatı alt sınırı',
    example: 100,
    type: Number,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  defaultSalePriceMin?: number;

  @ApiPropertyOptional({
    description: 'Satış fiyatı üst sınırı',
    example: 500,
    type: Number,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  defaultSalePriceMax?: number;

  @ApiPropertyOptional({
    description: 'Alış fiyatı alt sınırı',
    example: 50,
    type: Number,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  defaultPurchasePriceMin?: number;

  @ApiPropertyOptional({
    description: 'Alış fiyatı üst sınırı',
    example: 350,
    type: Number,
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  defaultPurchasePriceMax?: number;

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

  @ApiPropertyOptional({
    description: 'Varyant aktiflik filtresi (true, false, all)',
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
  variantIsActive?: ActiveFilter;
}

export class PaginatedProductsResponse extends PaginatedResponseDto<Product> {
  @ApiProperty({ type: [Product] })
  declare data: Product[];
}
