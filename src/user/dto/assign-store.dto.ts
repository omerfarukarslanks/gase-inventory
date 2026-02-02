import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { StoreUserRole } from '../user-store.entity';

export class AssignStoreDto {
  @ApiProperty({ description: 'Atanacak mağaza ID' })
  @IsUUID('4')
  @IsNotEmpty()
  storeId: string;

  @ApiPropertyOptional({ enum: StoreUserRole, default: StoreUserRole.STAFF })
  @IsOptional()
  @IsEnum(StoreUserRole)
  role?: StoreUserRole;
}
