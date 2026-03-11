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
import { AppContextService } from 'src/common/context/app-context.service';
import { InventoryService } from 'src/inventory/inventory.service';
import {
  AddCountLineDto,
  CreateCountSessionDto,
  CreateLocationDto,
  CreateWarehouseDto,
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
}
