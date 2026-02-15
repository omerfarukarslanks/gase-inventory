import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto, SortOrder } from 'src/common/dto/pagination.dto';
import { PaginatedResponseDto } from 'src/common/dto/paginated-response.dto';
import { Attribute } from '../entity/attribute.entity';

export enum ListAttributesSortBy {
  ID = 'id',
  NAME = 'name',
  VALUE = 'value',
  CREATED_AT = 'createdAt',
}

export { SortOrder };
export type ActiveFilter = boolean | 'all';

export class ListAttributesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Siralama alani',
    enum: ListAttributesSortBy,
    default: ListAttributesSortBy.CREATED_AT,
  })
  @IsEnum(ListAttributesSortBy)
  @IsOptional()
  public sortBy: string = ListAttributesSortBy.CREATED_AT;

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

export class PaginatedAttributesResponse extends PaginatedResponseDto<Attribute> {
  @ApiProperty({ type: [Attribute] })
  declare data: Attribute[];
}
