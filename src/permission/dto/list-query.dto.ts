import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListQueryDto {
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
