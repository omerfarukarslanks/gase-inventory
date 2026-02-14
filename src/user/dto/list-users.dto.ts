import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsUUID } from 'class-validator';
import { User } from '../user.entity';
import { PaginationQueryDto, SortOrder } from '../../common/dto/pagination.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export enum ListUsersSortBy {
  ID = 'id',
  EMAIL = 'email',
  NAME = 'name',
  SURNAME = 'surname',
  CREATED_AT = 'createdAt',
}

export { SortOrder }; // Re-export for compatibility if needed, though usually used from shared DTO
export type ActiveFilter = boolean | 'all';

export class ListUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Sıralama alanı',
    enum: ListUsersSortBy,
    default: ListUsersSortBy.CREATED_AT,
  })
  @IsEnum(ListUsersSortBy)
  @IsOptional()
  public sortBy: string = ListUsersSortBy.CREATED_AT;

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
    description: 'Mağaza bazlı kullanıcı filtresi',
    format: 'uuid',
  })
  @IsUUID('4')
  @IsOptional()
  storeId?: string;
}

export class PaginatedUsersResponse extends PaginatedResponseDto<User> {
  @ApiProperty({ type: [User] })
  declare data: User[];
}
