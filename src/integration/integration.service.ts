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
import { CryptoService } from './crypto.service';
import { ProviderFactory } from './provider.factory';

@Injectable()
export class IntegrationService {
  constructor(
    @InjectRepository(IntegrationConnection)
    private readonly connRepo: Repository<IntegrationConnection>,
    private readonly appContext: AppContextService,
    private readonly crypto: CryptoService,
    private readonly providerFactory: ProviderFactory,
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

  private encryptConfig(config: Record<string, any>): Record<string, any> {
    if (!config || Object.keys(config).length === 0) return config;
    return this.crypto.encrypt(config);
  }

  private decryptConfig(conn: IntegrationConnection): IntegrationConnection {
    if (conn.config) conn.config = this.crypto.decrypt(conn.config);
    return conn;
  }

  async create(dto: CreateIntegrationConnectionDto): Promise<IntegrationConnection> {
    const conn = this.connRepo.create({
      tenant: { id: this.tenantId() } as any,
      provider: dto.provider,
      name: dto.name,
      config: this.encryptConfig(dto.config ?? {}),
      createdById: this.userId(),
      updatedById: this.userId(),
    });
    return this.decryptConfig(await this.connRepo.save(conn));
  }

  async list(): Promise<IntegrationConnection[]> {
    const conns = await this.connRepo.find({
      where: { tenant: { id: this.tenantId() } },
      order: { createdAt: 'DESC' },
    });
    return conns.map((c) => this.decryptConfig(c));
  }

  async get(id: string): Promise<IntegrationConnection> {
    return this.decryptConfig(await this.findOrThrow(id));
  }

  async update(id: string, dto: UpdateIntegrationConnectionDto): Promise<IntegrationConnection> {
    const conn = await this.findOrThrow(id);
    if (dto.name   !== undefined) conn.name   = dto.name;
    if (dto.config !== undefined) conn.config = this.encryptConfig(dto.config);
    if (dto.status !== undefined) conn.status = dto.status;
    conn.updatedById = this.userId();
    return this.decryptConfig(await this.connRepo.save(conn));
  }

  async delete(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.connRepo.delete(id);
  }

  // ── Test / Sync ───────────────────────────────────────────────────────────

  /** Sağlayıcıya gerçek HTTP ping atar; sonuca göre status günceller. */
  async testConnection(id: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const conn = await this.findOrThrow(id);
    const decrypted = this.crypto.decrypt(conn.config);

    const provider = this.providerFactory.get(conn.provider);
    const result   = await provider.ping(decrypted);

    conn.status      = result.success ? IntegrationStatus.ACTIVE : IntegrationStatus.ERROR;
    conn.lastError   = result.success ? undefined : result.message;
    conn.updatedById = this.userId();
    await this.connRepo.save(conn);

    return { success: result.success, message: result.message, latencyMs: result.latencyMs };
  }

  /** Sağlayıcıya sync tetikler; lastSyncAt güncellenir. */
  async triggerSync(id: string): Promise<{ queued: boolean; message: string }> {
    const conn = await this.findOrThrow(id);
    const decrypted = this.crypto.decrypt(conn.config);
    const tenantId  = conn.tenant?.id ?? this.tenantId();

    const provider = this.providerFactory.get(conn.provider);
    const result   = await provider.sync(decrypted, tenantId, id);

    if (result.queued) {
      conn.lastSyncAt  = new Date();
      conn.lastError   = undefined;
      conn.updatedById = this.userId();
      await this.connRepo.save(conn);
    }

    return { queued: result.queued, message: result.message };
  }
}
