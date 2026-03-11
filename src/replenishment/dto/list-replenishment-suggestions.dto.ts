import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { SuggestionStatus } from '../entities/replenishment-suggestion.entity';

export class ListReplenishmentSuggestionsDto {
  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: SuggestionStatus })
  @IsOptional()
  @IsEnum(SuggestionStatus)
  status?: SuggestionStatus;

  @ApiPropertyOptional({ description: 'Mağaza filtresi' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  get hasPagination(): boolean {
    return this.page !== undefined || this.limit !== undefined;
  }

  get skip(): number {
    return ((this.page ?? 1) - 1) * (this.limit ?? 20);
  }
}
