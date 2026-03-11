import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DismissSuggestionDto {
  @ApiPropertyOptional({ description: 'Red sebebi (opsiyonel)' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
