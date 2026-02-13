import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
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

export class ListUsersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Sıralama alanı',
    enum: ListUsersSortBy,
    default: ListUsersSortBy.CREATED_AT,
  })
  @IsEnum(ListUsersSortBy)
  @IsOptional()
  public sortBy: string = ListUsersSortBy.CREATED_AT;
}

export class PaginatedUsersResponse extends PaginatedResponseDto<User> {
  @ApiProperty({ type: [User] })
  declare data: User[];
}
