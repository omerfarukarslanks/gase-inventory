import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsString, ArrayNotEmpty, ArrayUnique, IsOptional } from 'class-validator';
import { UserRole } from 'src/user/user.entity';

export class CreateRoleDto {
  @ApiProperty({ enum: UserRole, description: 'Permissions atanacak rol' })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({
    type: [String],
    example: ['STOCK_READ', 'SALE_CREATE', 'PRODUCT_READ'],
    description: 'Role eklenecek yetki adları listesi',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  permissionNames: string[];

  @ApiPropertyOptional({ example: true, default: true, description: 'Rol aktif mi?' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
