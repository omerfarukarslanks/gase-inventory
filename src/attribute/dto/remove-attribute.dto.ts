import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RemoveAttributeDto {
  @ApiProperty({ example: 'Renk', description: 'Pasife alinacak attribute adi' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
