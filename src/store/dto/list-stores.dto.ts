import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { Store } from '../store.entity';
import { PaginationQueryDto, SortOrder } from '../../common/dto/pagination.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export enum ListStoresSortBy {
  ID = 'id',
  NAME = 'name',
  CODE = 'code',
  SLUG = 'slug',
  CREATED_AT = 'createdAt',
}

export { SortOrder };
export type ActiveFilter = boolean | 'all';

export class ListStoresQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Sıralama alanı',
    enum: ListStoresSortBy,
    default: ListStoresSortBy.CREATED_AT,
  })
  @IsEnum(ListStoresSortBy)
  @IsOptional()
  public sortBy: string = ListStoresSortBy.CREATED_AT;

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
}

export class PaginatedStoresResponse extends PaginatedResponseDto<Store> {
  @ApiProperty({ type: [Store] })
  declare data: Store[];
}
