import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignStoreDto } from './dto/assign-store.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { User, UserRole } from './user.entity';
import { StoreUserRole } from './user-store.entity';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ListUsersDto, PaginatedUsersResponse } from './dto/list-users.dto';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class UserController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Tenant içinde yeni kullanıcı oluştur' })
  @RequirePermission(Permissions.USER_CREATE)

  create(@Body() dto: CreateUserDto) {
    return this.usersService.createUserForTenant({
      email: dto.email,
      password: dto.password,
      name: dto.name,
      surname: dto.surname,
      role: dto.role ?? UserRole.STAFF,
      storeIds: dto.storeIds,
    });
  }

  @Get()
  @ApiOperation({ summary: 'Tenant içindeki tüm kullanıcıları listele' })
  @ApiOkResponse({ type: PaginatedUsersResponse })
  @RequirePermission(Permissions.USER_READ)

  findAll(@Query() query: ListUsersDto): Promise<PaginatedUsersResponse> {
    return this.usersService.listUsersForTenant(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Kullanıcı detayı (store ilişkileriyle)' })
  @RequirePermission(Permissions.USER_READ)
  findOne(@Param('id') id: string) {
    return this.usersService.getUserDetails(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Kullanıcı güncelle' })
  @RequirePermission(Permissions.USER_UPDATE)
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUserForTenant(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Kullanıcıyı pasife al (soft delete)' })
  @RequirePermission(Permissions.USER_DELETE)

  remove(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Post(':id/stores')
  @ApiOperation({ summary: 'Kullanıcıyı mağazaya ata' })
  @RequirePermission(Permissions.USER_STORE_ASSIGN)
  assignStore(@Param('id') id: string, @Body() dto: AssignStoreDto) {
    return this.usersService.assignUserToStore(
      id,
      dto.storeId,
      dto.role ?? StoreUserRole.STAFF,
    );
  }

  @Delete(':id/stores/:storeId')
  @ApiOperation({ summary: 'Kullanıcıyı mağazadan çıkar' })
  @RequirePermission(Permissions.USER_STORE_ASSIGN)
  removeFromStore(
    @Param('id') id: string,
    @Param('storeId') storeId: string,
  ) {
    return this.usersService.removeUserFromStore(id, storeId);
  }
}

@ApiTags('Stores')
@ApiBearerAuth('access-token')
@Controller('stores')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StoreUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':storeId/users')
  @ApiOperation({ summary: 'Mağazaya kayıtlı kullanıcıları listele' })
  @RequirePermission(Permissions.USER_READ)
  listUsersForStore(@Param('storeId') storeId: string) {
    return this.usersService.listUsersForStore(storeId);
  }
}
