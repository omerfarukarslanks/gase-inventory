import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Toplam kayıt sayısı' })
  total: number;

  @ApiProperty({ description: 'Sayfa başına düşen kayıt sayısı' })
  limit: number;

  @ApiProperty({ description: 'Şu anki sayfa numarası' })
  page: number;

  @ApiProperty({ description: 'Toplam sayfa sayısı' })
  totalPages: number;

  @ApiProperty({ description: 'Bir sonraki sayfa var mı?', required: false })
  hasMore?: boolean;

  constructor(partial: Partial<PaginationMetaDto>) {
    Object.assign(this, partial);
  }
}

export class PaginatedResponseDto<T> {
  data: T[];

  @ApiProperty({ type: () => PaginationMetaDto })
  meta: PaginationMetaDto;

  constructor(data: T[], meta: PaginationMetaDto) {
    this.data = data;
    this.meta = meta;
  }
}
