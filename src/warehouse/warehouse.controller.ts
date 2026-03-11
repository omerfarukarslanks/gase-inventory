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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { WarehouseService } from './warehouse.service';
import {
  AddCountLineDto,
  CreateCountSessionDto,
  CreateLocationDto,
  CreateWarehouseDto,
  UpdateCountLineDto,
  UpdateLocationDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';

@ApiTags('Warehouse')
@ApiBearerAuth('access-token')
@Controller('warehouse')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  // ---- Warehouses ----

  @Post('warehouses')
  @ApiOperation({ summary: 'Yeni depo oluştur' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  createWarehouse(@Body() dto: CreateWarehouseDto) {
    return this.warehouseService.createWarehouse(dto);
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'Depo listesi' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  listWarehouses(@Query('storeId') storeId?: string) {
    return this.warehouseService.listWarehouses(storeId);
  }

  @Get('warehouses/:id')
  @ApiOperation({ summary: 'Depo detayı' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  getWarehouse(@Param('id') id: string) {
    return this.warehouseService.getWarehouse(id);
  }

  @Patch('warehouses/:id')
  @ApiOperation({ summary: 'Depo güncelle' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  updateWarehouse(@Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouseService.updateWarehouse(id, dto);
  }

  @Delete('warehouses/:id')
  @ApiOperation({ summary: 'Depo sil' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  deleteWarehouse(@Param('id') id: string) {
    return this.warehouseService.deleteWarehouse(id);
  }

  // ---- Locations ----

  @Post('locations')
  @ApiOperation({ summary: 'Yeni lokasyon oluştur' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  createLocation(@Body() dto: CreateLocationDto) {
    return this.warehouseService.createLocation(dto);
  }

  @Get('warehouses/:warehouseId/locations')
  @ApiOperation({ summary: 'Depoya ait lokasyon listesi' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  listLocations(@Param('warehouseId') warehouseId: string) {
    return this.warehouseService.listLocations(warehouseId);
  }

  @Get('locations/:id')
  @ApiOperation({ summary: 'Lokasyon detayı' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  getLocation(@Param('id') id: string) {
    return this.warehouseService.getLocation(id);
  }

  @Patch('locations/:id')
  @ApiOperation({ summary: 'Lokasyon güncelle' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  updateLocation(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.warehouseService.updateLocation(id, dto);
  }

  @Delete('locations/:id')
  @ApiOperation({ summary: 'Lokasyon sil' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  deleteLocation(@Param('id') id: string) {
    return this.warehouseService.deleteLocation(id);
  }

  // ---- Count Sessions ----

  @Post('count-sessions')
  @ApiOperation({ summary: 'Yeni sayım oturumu başlat' })
  @RequirePermission(Permissions.COUNT_SESSION_MANAGE)
  createCountSession(@Body() dto: CreateCountSessionDto) {
    return this.warehouseService.createCountSession(dto);
  }

  @Get('count-sessions')
  @ApiOperation({ summary: 'Sayım oturumu listesi' })
  @RequirePermission(Permissions.COUNT_SESSION_READ)
  listCountSessions(@Query('storeId') storeId?: string) {
    return this.warehouseService.listCountSessions(storeId);
  }

  @Get('count-sessions/:id')
  @ApiOperation({ summary: 'Sayım oturumu detayı (satırlar dahil)' })
  @RequirePermission(Permissions.COUNT_SESSION_READ)
  getCountSession(@Param('id') id: string) {
    return this.warehouseService.getCountSession(id);
  }

  @Post('count-sessions/:id/lines')
  @ApiOperation({ summary: 'Sayım oturumuna satır ekle' })
  @RequirePermission(Permissions.COUNT_SESSION_MANAGE)
  addCountLine(@Param('id') id: string, @Body() dto: AddCountLineDto) {
    return this.warehouseService.addCountLine(id, dto);
  }

  @Patch('count-sessions/:sessionId/lines/:lineId')
  @ApiOperation({ summary: 'Sayım satırını güncelle (sayılan miktar)' })
  @RequirePermission(Permissions.COUNT_SESSION_MANAGE)
  updateCountLine(
    @Param('sessionId') sessionId: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateCountLineDto,
  ) {
    return this.warehouseService.updateCountLine(sessionId, lineId, dto);
  }

  @Post('count-sessions/:id/close')
  @ApiOperation({ summary: 'Sayım oturumunu kapat ve stok düzeltmelerini uygula' })
  @RequirePermission(Permissions.COUNT_SESSION_ADJUST)
  closeCountSession(@Param('id') id: string) {
    return this.warehouseService.closeCountSession(id);
  }
}
