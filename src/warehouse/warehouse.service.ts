import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Warehouse } from './entities/warehouse.entity';
import { Location, LocationType } from './entities/location.entity';
import {
  CountSession,
  CountSessionStatus,
} from './entities/count-session.entity';
import { CountLine } from './entities/count-line.entity';
import { PutawayTask, PutawayTaskStatus } from './entities/putaway-task.entity';
import { Wave, WaveStatus } from './entities/wave.entity';
import { PickingTask, PickingTaskStatus } from './entities/picking-task.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { InventoryService } from 'src/inventory/inventory.service';
import {
  AddCountLineDto,
  AssignPickingTaskDto,
  AssignPutawayTaskDto,
  CompletePickingTaskDto,
  CreateCountSessionDto,
  CreateLocationDto,
  CreatePickingTaskDto,
  CreatePutawayTaskDto,
  CreateWarehouseDto,
  CreateWaveDto,
  UpdateCountLineDto,
  UpdateLocationDto,
  UpdateWarehouseDto,
} from './dto/warehouse.dto';

@Injectable()
export class WarehouseService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    @InjectRepository(Location)
    private readonly locationRepo: Repository<Location>,
    @InjectRepository(CountSession)
    private readonly sessionRepo: Repository<CountSession>,
    @InjectRepository(CountLine)
    private readonly lineRepo: Repository<CountLine>,
    @InjectRepository(PutawayTask)
    private readonly putawayRepo: Repository<PutawayTask>,
    @InjectRepository(Wave)
    private readonly waveRepo: Repository<Wave>,
    @InjectRepository(PickingTask)
    private readonly pickingRepo: Repository<PickingTask>,
    private readonly appContext: AppContextService,
    private readonly inventoryService: InventoryService,
    private readonly dataSource: DataSource,
  ) {}

  // ---- Helpers ----

  private getTenantId(): string {
    return this.appContext.getTenantIdOrThrow();
  }

  private getUserId(): string {
    return this.appContext.getUserIdOrThrow();
  }

  private async findWarehouseOrThrow(id: string): Promise<Warehouse> {
    const tenantId = this.getTenantId();
    const wh = await this.warehouseRepo.findOne({
      where: { id, tenant: { id: tenantId } },
    });
    if (!wh) throw new NotFoundException(`Depo bulunamadı: ${id}`);
    return wh;
  }

  private async findLocationOrThrow(id: string): Promise<Location> {
    const tenantId = this.getTenantId();
    const loc = await this.locationRepo.findOne({
      where: { id, tenant: { id: tenantId } },
    });
    if (!loc) throw new NotFoundException(`Lokasyon bulunamadı: ${id}`);
    return loc;
  }

  private async findSessionOrThrow(id: string): Promise<CountSession> {
    const tenantId = this.getTenantId();
    const session = await this.sessionRepo.findOne({
      where: { id, tenant: { id: tenantId } },
      relations: ['lines'],
    });
    if (!session) throw new NotFoundException(`Sayım oturumu bulunamadı: ${id}`);
    return session;
  }

  // ---- Warehouse CRUD ----

  async createWarehouse(dto: CreateWarehouseDto): Promise<Warehouse> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    const wh = this.warehouseRepo.create({
      tenant: { id: tenantId } as any,
      storeId: dto.storeId,
      name: dto.name,
      address: dto.address,
      createdById: userId,
      updatedById: userId,
    });
    return this.warehouseRepo.save(wh);
  }

  async listWarehouses(storeId?: string): Promise<Warehouse[]> {
    const tenantId = this.getTenantId();
    const qb = this.warehouseRepo
      .createQueryBuilder('w')
      .where('w.tenantId = :tenantId', { tenantId })
      .orderBy('w.name', 'ASC');

    if (storeId) {
      qb.andWhere('w.storeId = :storeId', { storeId });
    }

    return qb.getMany();
  }

  async getWarehouse(id: string): Promise<Warehouse> {
    return this.findWarehouseOrThrow(id);
  }

  async updateWarehouse(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    const wh = await this.findWarehouseOrThrow(id);
    Object.assign(wh, dto);
    wh.updatedById = this.getUserId();
    return this.warehouseRepo.save(wh);
  }

  async deleteWarehouse(id: string): Promise<void> {
    await this.findWarehouseOrThrow(id);
    await this.warehouseRepo.delete(id);
  }

  // ---- Location CRUD ----

  async createLocation(dto: CreateLocationDto): Promise<Location> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    const warehouse = await this.findWarehouseOrThrow(dto.warehouseId);

    const loc = this.locationRepo.create({
      tenant: { id: tenantId } as any,
      warehouse,
      code: dto.code,
      name: dto.name,
      type: dto.type ?? LocationType.BIN,
      createdById: userId,
      updatedById: userId,
    });
    return this.locationRepo.save(loc);
  }

  async listLocations(warehouseId: string): Promise<Location[]> {
    await this.findWarehouseOrThrow(warehouseId);
    return this.locationRepo.find({
      where: { warehouse: { id: warehouseId } },
      order: { code: 'ASC' },
    });
  }

  async getLocation(id: string): Promise<Location> {
    return this.findLocationOrThrow(id);
  }

  async updateLocation(id: string, dto: UpdateLocationDto): Promise<Location> {
    const loc = await this.findLocationOrThrow(id);
    Object.assign(loc, dto);
    loc.updatedById = this.getUserId();
    return this.locationRepo.save(loc);
  }

  async deleteLocation(id: string): Promise<void> {
    await this.findLocationOrThrow(id);
    await this.locationRepo.delete(id);
  }

  // ---- Count Session ----

  async createCountSession(dto: CreateCountSessionDto): Promise<CountSession> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();

    const session = this.sessionRepo.create({
      tenant: { id: tenantId } as any,
      storeId: dto.storeId,
      warehouseId: dto.warehouseId,
      notes: dto.notes,
      status: CountSessionStatus.OPEN,
      startedAt: new Date(),
      createdById: userId,
      updatedById: userId,
    });
    return this.sessionRepo.save(session);
  }

  async listCountSessions(storeId?: string): Promise<CountSession[]> {
    const tenantId = this.getTenantId();
    const qb = this.sessionRepo
      .createQueryBuilder('cs')
      .where('cs.tenantId = :tenantId', { tenantId })
      .orderBy('cs.startedAt', 'DESC');

    if (storeId) {
      qb.andWhere('cs.storeId = :storeId', { storeId });
    }

    return qb.getMany();
  }

  async getCountSession(id: string): Promise<CountSession> {
    return this.findSessionOrThrow(id);
  }

  async addCountLine(sessionId: string, dto: AddCountLineDto): Promise<CountLine> {
    const session = await this.findSessionOrThrow(sessionId);
    const userId = this.getUserId();

    if (session.status === CountSessionStatus.CLOSED) {
      throw new BadRequestException('Kapalı oturuma satır eklenemez.');
    }

    if (session.status === CountSessionStatus.OPEN) {
      session.status = CountSessionStatus.IN_PROGRESS;
      session.updatedById = userId;
      await this.sessionRepo.save(session);
    }

    const line = this.lineRepo.create({
      session,
      productVariantId: dto.productVariantId,
      lotNumber: dto.lotNumber,
      locationId: dto.locationId,
      expectedQuantity: dto.expectedQuantity,
      countedQuantity: dto.countedQuantity,
      isAdjusted: false,
      createdById: userId,
      updatedById: userId,
    });
    return this.lineRepo.save(line);
  }

  async updateCountLine(
    sessionId: string,
    lineId: string,
    dto: UpdateCountLineDto,
  ): Promise<CountLine> {
    const session = await this.findSessionOrThrow(sessionId);
    if (session.status === CountSessionStatus.CLOSED) {
      throw new BadRequestException('Kapalı oturumdaki satır güncellenemez.');
    }

    const line = await this.lineRepo.findOne({
      where: { id: lineId, session: { id: sessionId } },
    });
    if (!line) throw new NotFoundException(`Sayım satırı bulunamadı: ${lineId}`);

    line.countedQuantity = dto.countedQuantity;
    line.updatedById = this.getUserId();
    return this.lineRepo.save(line);
  }

  /**
   * Sayım oturumunu kapatır.
   * Sayılan miktar beklenenden farklı olan her satır için ADJUSTMENT hareketi oluşturur.
   * Tüm işlemler tek bir DB transaction'ında gerçekleşir.
   */
  async closeCountSession(id: string): Promise<CountSession> {
    const session = await this.findSessionOrThrow(id);
    const userId = this.getUserId();

    if (session.status === CountSessionStatus.CLOSED) {
      throw new BadRequestException('Oturum zaten kapalı.');
    }

    const unadjustedLines = session.lines.filter(
      (l) => !l.isAdjusted && l.countedQuantity !== null && l.countedQuantity !== undefined,
    );

    return this.dataSource.transaction(async (manager) => {
      for (const line of unadjustedLines) {
        const counted = Number(line.countedQuantity);
        const expected = Number(line.expectedQuantity);
        const diff = counted - expected;

        line.difference = diff;

        if (diff !== 0) {
          const movement = await this.inventoryService.createCountAdjustment(
            {
              storeId: session.storeId,
              productVariantId: line.productVariantId,
              quantityDelta: diff,
              reference: `COUNT-${session.id.slice(0, 8).toUpperCase()}`,
              lotNumber: line.lotNumber,
              locationId: line.locationId,
              meta: {
                countSessionId: session.id,
                countLineId: line.id,
              },
            },
            manager,
          );

          line.isAdjusted = true;
          line.adjustmentMovementId = movement?.id;
        }

        line.updatedById = userId;
        await manager.getRepository(CountLine).save(line);
      }

      session.status = CountSessionStatus.CLOSED;
      session.closedAt = new Date();
      session.updatedById = userId;
      return manager.getRepository(CountSession).save(session);
    });
  }

  // ---- Putaway Tasks ----

  async createPutawayTask(dto: CreatePutawayTaskDto): Promise<PutawayTask> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    await this.findWarehouseOrThrow(dto.warehouseId);
    const toLocation = await this.findLocationOrThrow(dto.toLocationId);

    const task = this.putawayRepo.create({
      tenant: { id: tenantId } as any,
      warehouseId: dto.warehouseId,
      productVariantId: dto.productVariantId,
      quantity: dto.quantity,
      toLocation,
      goodsReceiptId: dto.goodsReceiptId,
      notes: dto.notes,
      status: PutawayTaskStatus.PENDING,
      createdById: userId,
      updatedById: userId,
    });
    return this.putawayRepo.save(task);
  }

  async listPutawayTasks(warehouseId?: string): Promise<PutawayTask[]> {
    const tenantId = this.getTenantId();
    const qb = this.putawayRepo
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .orderBy('p.createdAt', 'DESC');
    if (warehouseId) {
      qb.andWhere('p.warehouseId = :warehouseId', { warehouseId });
    }
    return qb.getMany();
  }

  async getPutawayTask(id: string): Promise<PutawayTask> {
    const tenantId = this.getTenantId();
    const task = await this.putawayRepo.findOne({
      where: { id, tenant: { id: tenantId } },
    });
    if (!task) throw new NotFoundException(`Putaway görevi bulunamadı: ${id}`);
    return task;
  }

  async assignPutawayTask(id: string, dto: AssignPutawayTaskDto): Promise<PutawayTask> {
    const task = await this.getPutawayTask(id);
    if (task.status === PutawayTaskStatus.COMPLETED || task.status === PutawayTaskStatus.CANCELLED) {
      throw new BadRequestException('Tamamlanmış veya iptal edilmiş görev atanamaz.');
    }
    task.assignedToUserId = dto.userId;
    task.status = PutawayTaskStatus.IN_PROGRESS;
    task.updatedById = this.getUserId();
    return this.putawayRepo.save(task);
  }

  async completePutawayTask(id: string): Promise<PutawayTask> {
    const task = await this.getPutawayTask(id);
    if (task.status === PutawayTaskStatus.COMPLETED) {
      throw new BadRequestException('Görev zaten tamamlanmış.');
    }
    if (task.status === PutawayTaskStatus.CANCELLED) {
      throw new BadRequestException('İptal edilmiş görev tamamlanamaz.');
    }
    task.status = PutawayTaskStatus.COMPLETED;
    task.completedAt = new Date();
    task.updatedById = this.getUserId();
    return this.putawayRepo.save(task);
  }

  async cancelPutawayTask(id: string): Promise<PutawayTask> {
    const task = await this.getPutawayTask(id);
    if (task.status === PutawayTaskStatus.COMPLETED) {
      throw new BadRequestException('Tamamlanmış görev iptal edilemez.');
    }
    task.status = PutawayTaskStatus.CANCELLED;
    task.updatedById = this.getUserId();
    return this.putawayRepo.save(task);
  }

  // ---- Waves ----

  async createWave(dto: CreateWaveDto): Promise<Wave> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    await this.findWarehouseOrThrow(dto.warehouseId);

    const wave = this.waveRepo.create({
      tenant: { id: tenantId } as any,
      warehouseId: dto.warehouseId,
      code: dto.code,
      notes: dto.notes,
      status: WaveStatus.OPEN,
      createdById: userId,
      updatedById: userId,
    });
    return this.waveRepo.save(wave);
  }

  async listWaves(warehouseId?: string): Promise<Wave[]> {
    const tenantId = this.getTenantId();
    const qb = this.waveRepo
      .createQueryBuilder('w')
      .where('w.tenantId = :tenantId', { tenantId })
      .orderBy('w.createdAt', 'DESC');
    if (warehouseId) {
      qb.andWhere('w.warehouseId = :warehouseId', { warehouseId });
    }
    return qb.getMany();
  }

  async getWave(id: string): Promise<Wave> {
    const tenantId = this.getTenantId();
    const wave = await this.waveRepo.findOne({ where: { id, tenant: { id: tenantId } } });
    if (!wave) throw new NotFoundException(`Wave bulunamadı: ${id}`);
    return wave;
  }

  async startWave(id: string): Promise<Wave> {
    const wave = await this.getWave(id);
    if (wave.status !== WaveStatus.OPEN) {
      throw new BadRequestException('Yalnızca OPEN durumundaki wave başlatılabilir.');
    }
    wave.status = WaveStatus.IN_PROGRESS;
    wave.startedAt = new Date();
    wave.updatedById = this.getUserId();
    return this.waveRepo.save(wave);
  }

  async completeWave(id: string): Promise<Wave> {
    const wave = await this.getWave(id);
    if (wave.status === WaveStatus.COMPLETED) {
      throw new BadRequestException('Wave zaten tamamlanmış.');
    }
    if (wave.status === WaveStatus.CANCELLED) {
      throw new BadRequestException('İptal edilmiş wave tamamlanamaz.');
    }
    wave.status = WaveStatus.COMPLETED;
    wave.completedAt = new Date();
    wave.updatedById = this.getUserId();
    return this.waveRepo.save(wave);
  }

  // ---- Picking Tasks ----

  async createPickingTask(dto: CreatePickingTaskDto): Promise<PickingTask> {
    const tenantId = this.getTenantId();
    const userId = this.getUserId();
    await this.findWarehouseOrThrow(dto.warehouseId);
    const fromLocation = await this.findLocationOrThrow(dto.fromLocationId);

    let wave: Wave | undefined;
    if (dto.waveId) {
      wave = await this.getWave(dto.waveId);
      if (wave.status === WaveStatus.COMPLETED || wave.status === WaveStatus.CANCELLED) {
        throw new BadRequestException('Tamamlanmış veya iptal edilmiş wave\'e görev eklenemez.');
      }
    }

    const task = this.pickingRepo.create({
      tenant: { id: tenantId } as any,
      warehouseId: dto.warehouseId,
      productVariantId: dto.productVariantId,
      requestedQuantity: dto.requestedQuantity,
      fromLocation,
      wave: wave ?? undefined,
      saleId: dto.saleId,
      notes: dto.notes,
      status: PickingTaskStatus.PENDING,
      createdById: userId,
      updatedById: userId,
    });
    return this.pickingRepo.save(task);
  }

  async listPickingTasks(warehouseId?: string, waveId?: string): Promise<PickingTask[]> {
    const tenantId = this.getTenantId();
    const qb = this.pickingRepo
      .createQueryBuilder('p')
      .where('p.tenantId = :tenantId', { tenantId })
      .orderBy('p.createdAt', 'DESC');
    if (warehouseId) {
      qb.andWhere('p.warehouseId = :warehouseId', { warehouseId });
    }
    if (waveId) {
      qb.andWhere('p.waveId = :waveId', { waveId });
    }
    return qb.getMany();
  }

  async getPickingTask(id: string): Promise<PickingTask> {
    const tenantId = this.getTenantId();
    const task = await this.pickingRepo.findOne({
      where: { id, tenant: { id: tenantId } },
    });
    if (!task) throw new NotFoundException(`Picking görevi bulunamadı: ${id}`);
    return task;
  }

  async assignPickingTask(id: string, dto: AssignPickingTaskDto): Promise<PickingTask> {
    const task = await this.getPickingTask(id);
    if (task.status === PickingTaskStatus.COMPLETED || task.status === PickingTaskStatus.CANCELLED) {
      throw new BadRequestException('Tamamlanmış veya iptal edilmiş görev atanamaz.');
    }
    task.assignedToUserId = dto.userId;
    task.status = PickingTaskStatus.IN_PROGRESS;
    task.updatedById = this.getUserId();
    return this.pickingRepo.save(task);
  }

  async completePickingTask(id: string, dto: CompletePickingTaskDto): Promise<PickingTask> {
    const task = await this.getPickingTask(id);
    if (task.status === PickingTaskStatus.COMPLETED) {
      throw new BadRequestException('Görev zaten tamamlanmış.');
    }
    if (task.status === PickingTaskStatus.CANCELLED) {
      throw new BadRequestException('İptal edilmiş görev tamamlanamaz.');
    }
    task.pickedQuantity = dto.pickedQuantity;
    task.status =
      dto.pickedQuantity < task.requestedQuantity
        ? PickingTaskStatus.SHORT_PICK
        : PickingTaskStatus.COMPLETED;
    task.completedAt = new Date();
    task.updatedById = this.getUserId();
    return this.pickingRepo.save(task);
  }

  async cancelPickingTask(id: string): Promise<PickingTask> {
    const task = await this.getPickingTask(id);
    if (task.status === PickingTaskStatus.COMPLETED) {
      throw new BadRequestException('Tamamlanmış görev iptal edilemez.');
    }
    task.status = PickingTaskStatus.CANCELLED;
    task.updatedById = this.getUserId();
    return this.pickingRepo.save(task);
  }
}
