import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
  ArrayMinSize,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export type ChatRole = 'system' | 'user' | 'assistant';

export class ChatMessageDto {
  @ApiProperty({
    description: 'Mesaj rolu',
    enum: ['system', 'user', 'assistant'],
    example: 'user',
  })
  @IsIn(['system', 'user', 'assistant'])
  role: ChatRole;

  @ApiProperty({
    description: 'Mesaj icerigi',
    example: 'Merhaba, bugunun satis ozetini ver.',
  })
  @IsString()
  @IsNotEmpty()
  content: string;
}

export class ChatRequestDto {
  @ApiProperty({
    description: 'Chat mesaj dizisi',
    type: [ChatMessageDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages: ChatMessageDto[];

  // opsiyonel: ileride store seçmek vs.
  @ApiProperty({
    description: 'Mağaza ID'
  })
  @IsString()
  @IsOptional()
  storeId?: string;
}
