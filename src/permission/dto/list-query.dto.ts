import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ListQueryDto {
  @ApiPropertyOptional({
    example: 'stock',
    description: 'name, description veya group içinde arama yapar (büyük/küçük harf duyarsız)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    default: 1,
    minimum: 1,
    description: 'Sayfa numarası. page ve limit gönderilmezse tüm kayıtlar döner.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number;

  @ApiPropertyOptional({
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Sayfa başına kayıt. page ve limit gönderilmezse tüm kayıtlar döner.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number;
}
