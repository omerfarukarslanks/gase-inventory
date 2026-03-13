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
  AssignPickingTaskDto,
  AssignPutawayTaskDto,
  CompletePickingTaskDto,
  CreateCountSessionDto,
  CreateGoodsReceiptPutawayTasksDto,
  CreateLocationDto,
  CreatePickingTaskDto,
  CreatePutawayTaskDto,
  CreateWarehouseDto,
  CreateWaveDto,
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

  // ---- Putaway Tasks ----

  @Post('putaway-tasks')
  @ApiOperation({ summary: 'Yeni putaway (yerleştirme) görevi oluştur' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  createPutawayTask(@Body() dto: CreatePutawayTaskDto) {
    return this.warehouseService.createPutawayTask(dto);
  }

  @Post('goods-receipts/:id/putaway-tasks')
  @ApiOperation({ summary: 'Mal kabul kaydindan putaway gorevleri oluştur' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  createPutawayTasksFromGoodsReceipt(
    @Param('id') id: string,
    @Body() dto: CreateGoodsReceiptPutawayTasksDto,
  ) {
    return this.warehouseService.createPutawayTasksFromGoodsReceipt(id, dto);
  }

  @Get('putaway-tasks')
  @ApiOperation({ summary: 'Putaway görevleri listesi' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  listPutawayTasks(@Query('warehouseId') warehouseId?: string) {
    return this.warehouseService.listPutawayTasks(warehouseId);
  }

  @Get('putaway-tasks/:id')
  @ApiOperation({ summary: 'Putaway görevi detayı' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  getPutawayTask(@Param('id') id: string) {
    return this.warehouseService.getPutawayTask(id);
  }

  @Post('putaway-tasks/:id/assign')
  @ApiOperation({ summary: 'Putaway görevini kullanıcıya ata' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  assignPutawayTask(@Param('id') id: string, @Body() dto: AssignPutawayTaskDto) {
    return this.warehouseService.assignPutawayTask(id, dto);
  }

  @Post('putaway-tasks/:id/complete')
  @ApiOperation({ summary: 'Putaway görevini tamamla' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  completePutawayTask(@Param('id') id: string) {
    return this.warehouseService.completePutawayTask(id);
  }

  @Post('putaway-tasks/:id/cancel')
  @ApiOperation({ summary: 'Putaway görevini iptal et' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  cancelPutawayTask(@Param('id') id: string) {
    return this.warehouseService.cancelPutawayTask(id);
  }

  // ---- Waves ----

  @Post('waves')
  @ApiOperation({ summary: 'Yeni wave (toplu toplama dalgası) oluştur' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  createWave(@Body() dto: CreateWaveDto) {
    return this.warehouseService.createWave(dto);
  }

  @Get('waves')
  @ApiOperation({ summary: 'Wave listesi' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  listWaves(@Query('warehouseId') warehouseId?: string) {
    return this.warehouseService.listWaves(warehouseId);
  }

  @Get('waves/:id')
  @ApiOperation({ summary: 'Wave detayı' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  getWave(@Param('id') id: string) {
    return this.warehouseService.getWave(id);
  }

  @Post('waves/:id/start')
  @ApiOperation({ summary: 'Wave\'i başlat (OPEN → IN_PROGRESS)' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  startWave(@Param('id') id: string) {
    return this.warehouseService.startWave(id);
  }

  @Post('waves/:id/complete')
  @ApiOperation({ summary: 'Wave\'i tamamla' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  completeWave(@Param('id') id: string) {
    return this.warehouseService.completeWave(id);
  }

  // ---- Picking Tasks ----

  @Post('picking-tasks')
  @ApiOperation({ summary: 'Yeni picking (toplama) görevi oluştur' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  createPickingTask(@Body() dto: CreatePickingTaskDto) {
    return this.warehouseService.createPickingTask(dto);
  }

  @Get('picking-tasks')
  @ApiOperation({ summary: 'Picking görevleri listesi' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  listPickingTasks(
    @Query('warehouseId') warehouseId?: string,
    @Query('waveId') waveId?: string,
  ) {
    return this.warehouseService.listPickingTasks(warehouseId, waveId);
  }

  @Get('picking-tasks/:id')
  @ApiOperation({ summary: 'Picking görevi detayı' })
  @RequirePermission(Permissions.WAREHOUSE_READ)
  getPickingTask(@Param('id') id: string) {
    return this.warehouseService.getPickingTask(id);
  }

  @Post('picking-tasks/:id/assign')
  @ApiOperation({ summary: 'Picking görevini kullanıcıya ata' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  assignPickingTask(@Param('id') id: string, @Body() dto: AssignPickingTaskDto) {
    return this.warehouseService.assignPickingTask(id, dto);
  }

  @Post('picking-tasks/:id/complete')
  @ApiOperation({ summary: 'Picking görevini tamamla (toplanan miktarı gir)' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  completePickingTask(@Param('id') id: string, @Body() dto: CompletePickingTaskDto) {
    return this.warehouseService.completePickingTask(id, dto);
  }

  @Post('picking-tasks/:id/cancel')
  @ApiOperation({ summary: 'Picking görevini iptal et' })
  @RequirePermission(Permissions.WAREHOUSE_MANAGE)
  cancelPickingTask(@Param('id') id: string) {
    return this.warehouseService.cancelPickingTask(id);
  }
}
