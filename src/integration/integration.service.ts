import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppContextService } from 'src/common/context/app-context.service';
import {
  IntegrationConnection,
  IntegrationStatus,
} from './entities/integration-connection.entity';
import {
  CreateIntegrationConnectionDto,
  UpdateIntegrationConnectionDto,
} from './dto/integration.dto';

@Injectable()
export class IntegrationService {
  constructor(
    @InjectRepository(IntegrationConnection)
    private readonly connRepo: Repository<IntegrationConnection>,
    private readonly appContext: AppContextService,
  ) {}

  private tenantId() { return this.appContext.getTenantIdOrThrow(); }
  private userId()   { return this.appContext.getUserIdOrThrow(); }

  private async findOrThrow(id: string): Promise<IntegrationConnection> {
    const conn = await this.connRepo.findOne({
      where: { id, tenant: { id: this.tenantId() } },
    });
    if (!conn) throw new NotFoundException(`Entegrasyon bağlantısı bulunamadı: ${id}`);
    return conn;
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(dto: CreateIntegrationConnectionDto): Promise<IntegrationConnection> {
    const conn = this.connRepo.create({
      tenant: { id: this.tenantId() } as any,
      provider: dto.provider,
      name: dto.name,
      config: dto.config ?? {},
      createdById: this.userId(),
      updatedById: this.userId(),
    });
    return this.connRepo.save(conn);
  }

  async list(): Promise<IntegrationConnection[]> {
    return this.connRepo.find({
      where: { tenant: { id: this.tenantId() } },
      order: { createdAt: 'DESC' },
    });
  }

  async get(id: string): Promise<IntegrationConnection> {
    return this.findOrThrow(id);
  }

  async update(id: string, dto: UpdateIntegrationConnectionDto): Promise<IntegrationConnection> {
    const conn = await this.findOrThrow(id);
    if (dto.name   !== undefined) conn.name   = dto.name;
    if (dto.config !== undefined) conn.config = dto.config;
    if (dto.status !== undefined) conn.status = dto.status;
    conn.updatedById = this.userId();
    return this.connRepo.save(conn);
  }

  async delete(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.connRepo.delete(id);
  }

  // ── Test / Sync stubs ─────────────────────────────────────────────────────

  /**
   * Bağlantının canlı olup olmadığını test eder.
   * Gerçek implementasyon sağlayıcıya ping atar; şimdilik stub.
   */
  async testConnection(id: string): Promise<{ success: boolean; message: string }> {
    const conn = await this.findOrThrow(id);
    // TODO: provider'a göre gerçek ping/OAuth check
    conn.lastError = undefined;
    conn.status = IntegrationStatus.ACTIVE;
    conn.updatedById = this.userId();
    await this.connRepo.save(conn);
    return { success: true, message: `${conn.provider} bağlantısı başarılı.` };
  }

  /**
   * Manuel senkronizasyonu tetikler.
   * Gerçek implementasyon outbox'a event yazar; şimdilik stub.
   */
  async triggerSync(id: string): Promise<{ queued: boolean }> {
    const conn = await this.findOrThrow(id);
    conn.lastSyncAt = new Date();
    conn.updatedById = this.userId();
    await this.connRepo.save(conn);
    // TODO: outbox'a sync event yaz
    return { queued: true };
  }
}
