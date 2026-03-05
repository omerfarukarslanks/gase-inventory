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
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { StoresService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { ApiOkResponse, ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ListStoresQueryDto, PaginatedStoresResponse } from './dto/list-stores.dto';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('Stores')
@ApiBearerAuth('access-token')
@Controller('stores')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class StoreController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni mağaza oluştur' })
  @RequirePermission(Permissions.STORE_CREATE)

  create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Mevcut tenant için tüm mağazaları listele' })
  @ApiOkResponse({ type: PaginatedStoresResponse })
  @RequirePermission(Permissions.STORE_READ)
  findAll(@Query() query: ListStoresQueryDto) {
    return this.storesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Belirli bir mağazayı getir' })
  @RequirePermission(Permissions.STORE_READ)
  findOne(@Param('id') id: string) {
    return this.storesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Belirli bir mağazayı güncelle' })
  @RequirePermission(Permissions.STORE_UPDATE)

  update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.storesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Belirli bir mağazayı pasife al (soft delete)' })
  @RequirePermission(Permissions.STORE_DELETE)

  remove(@Param('id') id: string) {
    return this.storesService.remove(id);
  }
}
