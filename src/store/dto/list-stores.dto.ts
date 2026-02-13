import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
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

export class ListStoresQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Sıralama alanı',
    enum: ListStoresSortBy,
    default: ListStoresSortBy.CREATED_AT,
  })
  @IsEnum(ListStoresSortBy)
  @IsOptional()
  public sortBy: string = ListStoresSortBy.CREATED_AT;
}

export class PaginatedStoresResponse extends PaginatedResponseDto<Store> {
  @ApiProperty({ type: [Store] })
  declare data: Store[];
}
