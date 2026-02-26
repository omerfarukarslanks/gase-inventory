import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginatedResponseDto } from 'src/common/dto/paginated-response.dto';
import { ProductCategory } from '../product-category.entity';

export type ActiveFilter = boolean | 'all';

export class ListProductCategoriesQueryDto {
  @ApiPropertyOptional({
    description: 'Sayfa numarasi (verilmezse tum kayitlar doner)',
    minimum: 1,
    type: Number,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({
    description: 'Sayfa basina dusen kayit sayisi (verilmezse tum kayitlar doner)',
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

  @ApiPropertyOptional({
    description: 'Arama sorgusu (kategori adi, slug, aciklama, ust kategori adi)',
    type: String,
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Pasif kategorileri de dahil et',
    default: false,
    type: Boolean,
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  isActive?: ActiveFilter;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 10);
  }
}

export class PaginatedProductCategoriesResponse extends PaginatedResponseDto<ProductCategory> {
  @ApiProperty({ type: [ProductCategory] })
  declare data: ProductCategory[];
}
