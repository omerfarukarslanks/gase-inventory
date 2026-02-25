import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';

export type ActiveFilter = boolean | 'all';

export class ListPackagesDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Aktiflik filtresi (true → sadece aktif, false → sadece pasif, all → hepsi)',
    enum: ['all', 'true', 'false'],
    default: 'true',
  })
  @Transform(({ value }) => {
    if (value === 'all') return 'all';
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsIn(['all', true, false])
  @IsOptional()
  isActive?: ActiveFilter = true;
}
