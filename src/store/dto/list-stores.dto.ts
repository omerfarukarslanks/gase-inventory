import { ApiProperty } from '@nestjs/swagger';
import { Store } from '../store.entity';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { PaginatedResponseDto } from '../../common/dto/paginated-response.dto';

export class ListStoresQueryDto extends PaginationQueryDto {}

export class PaginatedStoresResponse extends PaginatedResponseDto<Store> {
  @ApiProperty({ type: [Store] })
  declare data: Store[];
}
