import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { AiActionStatus, AiActionType } from '../entities/ai-action-suggestion.entity';

export class AnalyzeContextDto {
  @ApiPropertyOptional({ description: 'Sadece bu mağaza için analiz yap' })
  @IsOptional()
  @IsUUID('4')
  storeId?: string;

  @ApiPropertyOptional({ description: 'Düşük stok eşiği (varsayılan: 10)', default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  lowStockThreshold?: number;
}

export class ListAiSuggestionsQueryDto {
  @ApiPropertyOptional({ enum: AiActionStatus })
  @IsOptional()
  @IsEnum(AiActionStatus)
  status?: AiActionStatus;

  @ApiPropertyOptional({ enum: AiActionType })
  @IsOptional()
  @IsEnum(AiActionType)
  actionType?: AiActionType;
}
