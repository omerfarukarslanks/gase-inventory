import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignStoreDto } from './dto/assign-store.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { UserRole } from './user.entity';
import { StoreUserRole } from './user-store.entity';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UserController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ApiOperation({ summary: 'Tenant içinde yeni kullanıcı oluştur' })
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
  findAll() {
    return this.usersService.listUsersForTenant();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Kullanıcı detayı (store ilişkileriyle)' })
  findOne(@Param('id') id: string) {
    return this.usersService.getUserDetails(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Kullanıcı güncelle' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUserForTenant(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Kullanıcı sil' })
  remove(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Post(':id/stores')
  @ApiOperation({ summary: 'Kullanıcıyı mağazaya ata' })
  assignStore(@Param('id') id: string, @Body() dto: AssignStoreDto) {
    return this.usersService.assignUserToStore(
      id,
      dto.storeId,
      dto.role ?? StoreUserRole.STAFF,
    );
  }

  @Delete(':id/stores/:storeId')
  @ApiOperation({ summary: 'Kullanıcıyı mağazadan çıkar' })
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
@UseGuards(JwtAuthGuard)
export class StoreUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(':storeId/users')
  @ApiOperation({ summary: 'Mağazaya kayıtlı kullanıcıları listele' })
  listUsersForStore(@Param('storeId') storeId: string) {
    return this.usersService.listUsersForStore(storeId);
  }
}
