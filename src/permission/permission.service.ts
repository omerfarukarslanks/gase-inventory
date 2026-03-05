import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Permission } from './permission.entity';
import { RolePermission } from './role-permission.entity';
import { Role } from './role.entity';
import {
  DEFAULT_ROLE_PERMISSIONS,
  PERMISSION_META,
  PermissionName,
  Permissions,
} from './constants/permissions.constants';
import { UserRole } from 'src/user/user.entity';
import { Tenant } from 'src/tenant/tenant.entity';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { ListQueryDto } from './dto/list-query.dto';

@Injectable()
export class PermissionService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionService.name);

  /** tenantId:role → Set<permissionName> */
  private readonly cache = new Map<string, Set<string>>();
  private readonly cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 60_000;

  constructor(
    @InjectRepository(Permission)
    private readonly permRepo: Repository<Permission>,

    @InjectRepository(RolePermission)
    private readonly rolePRepo: Repository<RolePermission>,

    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,

    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
  ) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async onApplicationBootstrap() {
    await this.seedPermissions();
  }

  async seedPermissions(): Promise<void> {
    this.logger.log('Seeding permissions...');

    for (const name of Object.values(Permissions)) {
      const meta = PERMISSION_META[name as PermissionName];
      const existing = await this.permRepo.findOne({ where: { name } });

      if (!existing) {
        await this.permRepo.save(
          this.permRepo.create({ name, description: meta.description, group: meta.group }),
        );
      } else if (existing.description !== meta.description || existing.group !== meta.group) {
        await this.permRepo.update(existing.id, {
          description: meta.description,
          group: meta.group,
        });
      }
    }

    const tenants = await this.tenantRepo.find();
    for (const tenant of tenants) {
      await this.ensureDefaultPermissionsForTenant(tenant.id);
    }

    this.logger.log('Permission seeding complete.');
  }

  async ensureDefaultPermissionsForTenant(tenantId: string): Promise<void> {
    // Her rol için Role kaydı oluştur (yoksa)
    for (const role of Object.values(UserRole)) {
      const exists = await this.roleRepo.findOne({
        where: { tenant: { id: tenantId }, role },
      });
      if (!exists) {
        await this.roleRepo.save(
          this.roleRepo.create({ tenant: { id: tenantId }, role, isActive: true }),
        );
      }
    }

    // Varsayılan role-permission kayıtlarını ekle
    for (const [role, permNames] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
      for (const permName of permNames) {
        const perm = await this.permRepo.findOne({ where: { name: permName } });
        if (!perm) continue;

        const exists = await this.rolePRepo.findOne({
          where: { tenant: { id: tenantId }, role: role as UserRole, permission: { id: perm.id } },
        });

        if (!exists) {
          await this.rolePRepo.save(
            this.rolePRepo.create({
              tenant: { id: tenantId },
              role: role as UserRole,
              permission: perm,
            }),
          );
        }
      }
    }

    this.invalidateCache(tenantId);
  }

  // ─── Guard API'si ────────────────────────────────────────────────────────────

  async hasPermission(tenantId: string, role: UserRole, permissionName: string): Promise<boolean> {
    // Rol pasifse direkt reddet
    const roleRecord = await this.roleRepo.findOne({
      where: { tenant: { id: tenantId }, role },
    });
    if (roleRecord && !roleRecord.isActive) return false;

    const perms = await this.getRolePermissions(tenantId, role);
    return perms.has(permissionName);
  }

  async getRolePermissions(tenantId: string, role: UserRole): Promise<Set<string>> {
    const key = `${tenantId}:${role}`;
    const expiry = this.cacheExpiry.get(key) ?? 0;

    if (Date.now() < expiry && this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // Sadece aktif permission'ları getir
    const rows = await this.rolePRepo.find({
      where: { tenant: { id: tenantId }, role },
      relations: ['permission'],
    });

    const names = new Set(
      rows.filter((r) => r.permission.isActive).map((r) => r.permission.name),
    );
    this.cache.set(key, names);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL_MS);

    return names;
  }

  // ─── Permission CRUD ─────────────────────────────────────────────────────────

  async createPermission(dto: CreatePermissionDto): Promise<Permission> {
    const existing = await this.permRepo.findOne({ where: { name: dto.name } });

    if (existing) {
      // Zaten varsa description / group / isActive güncelle (upsert)
      if (dto.description !== undefined) existing.description = dto.description;
      if (dto.group !== undefined) existing.group = dto.group;
      if (dto.isActive !== undefined) {
        existing.isActive = dto.isActive;
        this.invalidateAllCache();
      }
      return this.permRepo.save(existing);
    }

    return this.permRepo.save(
      this.permRepo.create({
        name: dto.name,
        description: dto.description,
        group: dto.group,
        isActive: dto.isActive ?? true,
      }),
    );
  }

  async updatePermission(id: string, dto: UpdatePermissionDto): Promise<Permission> {
    const perm = await this.permRepo.findOne({ where: { id } });
    if (!perm) {
      throw new NotFoundException(`Yetki bulunamadı: ${id}`);
    }

    if (dto.description !== undefined) perm.description = dto.description;
    if (dto.group !== undefined) perm.group = dto.group;
    if (dto.isActive !== undefined) {
      perm.isActive = dto.isActive;
      // İsActive değişince tüm tenant cache'lerini temizle
      this.invalidateAllCache();
    }

    return this.permRepo.save(perm);
  }

  async listPermissions(query: ListQueryDto): Promise<{
    data: Permission[];
    meta: { total: number; page?: number; limit?: number; totalPages?: number };
  }> {
    const order = { group: 'ASC' as const, name: 'ASC' as const };
    const isPaginated = query.page !== undefined || query.limit !== undefined;

    const where = query.search
      ? [
          { name: ILike(`%${query.search}%`) },
          { description: ILike(`%${query.search}%`) },
          { group: ILike(`%${query.search}%`) },
        ]
      : undefined;

    if (!isPaginated) {
      const data = await this.permRepo.find({ where, order });
      return { data, meta: { total: data.length } };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [data, total] = await this.permRepo.findAndCount({
      where,
      order,
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Role CRUD ───────────────────────────────────────────────────────────────

  /**
   * Role yetki ekler (mevcut yetkiler korunur).
   * isActive ile rol durumu da güncellenebilir.
   */
  async createRole(
    tenantId: string,
    dto: CreateRoleDto,
  ): Promise<{ role: UserRole; isActive: boolean; added: string[]; skipped: string[]; notFound: string[] }> {
    // Role kaydını getir veya oluştur
    let roleRecord = await this.roleRepo.findOne({
      where: { tenant: { id: tenantId }, role: dto.role },
    });
    if (!roleRecord) {
      roleRecord = await this.roleRepo.save(
        this.roleRepo.create({ tenant: { id: tenantId }, role: dto.role, isActive: dto.isActive ?? true }),
      );
    } else if (dto.isActive !== undefined) {
      roleRecord.isActive = dto.isActive;
      roleRecord = await this.roleRepo.save(roleRecord);
    }

    const added: string[] = [];
    const skipped: string[] = [];
    const notFound: string[] = [];

    for (const permName of dto.permissionNames) {
      const perm = await this.permRepo.findOne({ where: { name: permName } });
      if (!perm) { notFound.push(permName); continue; }

      const exists = await this.rolePRepo.findOne({
        where: { tenant: { id: tenantId }, role: dto.role, permission: { id: perm.id } },
      });
      if (exists) { skipped.push(permName); continue; }

      await this.rolePRepo.save(
        this.rolePRepo.create({ tenant: { id: tenantId }, role: dto.role, permission: perm }),
      );
      added.push(permName);
    }

    if (added.length > 0 || dto.isActive !== undefined) {
      this.invalidateCache(tenantId, dto.role);
    }

    return { role: dto.role, isActive: roleRecord.isActive, added, skipped, notFound };
  }

  /**
   * Rolün tüm yetkilerini verilen listeyle değiştirir.
   * isActive ile rol durumu da güncellenebilir.
   */
  async updateRole(
    tenantId: string,
    role: UserRole,
    dto: UpdateRoleDto,
  ): Promise<{ role: UserRole; isActive: boolean; set: string[]; notFound: string[] }> {
    let roleRecord = await this.roleRepo.findOne({
      where: { tenant: { id: tenantId }, role },
    });
    if (!roleRecord) {
      roleRecord = await this.roleRepo.save(
        this.roleRepo.create({ tenant: { id: tenantId }, role, isActive: dto.isActive ?? true }),
      );
    } else if (dto.isActive !== undefined) {
      roleRecord.isActive = dto.isActive;
      roleRecord = await this.roleRepo.save(roleRecord);
    }

    // Mevcut permission eşlemelerini temizle ve yeniden ekle
    await this.rolePRepo.delete({ tenant: { id: tenantId }, role });

    const set: string[] = [];
    const notFound: string[] = [];

    for (const permName of dto.permissionNames) {
      const perm = await this.permRepo.findOne({ where: { name: permName } });
      if (!perm) { notFound.push(permName); continue; }

      await this.rolePRepo.save(
        this.rolePRepo.create({ tenant: { id: tenantId }, role, permission: perm }),
      );
      set.push(permName);
    }

    this.invalidateCache(tenantId, role);
    return { role, isActive: roleRecord.isActive, set, notFound };
  }

  async listRoles(
    tenantId: string,
    query: ListQueryDto,
  ): Promise<{
    data: { role: UserRole; isActive: boolean; permissions: { name: string; group: string; description: string; isActive: boolean }[] }[];
    meta: { total: number; page?: number; limit?: number; totalPages?: number };
  }> {
    const allRoles = Object.values(UserRole);
    const total = allRoles.length;
    const isPaginated = query.page !== undefined || query.limit !== undefined;

    const rolesToFetch = isPaginated
      ? allRoles.slice(
          ((query.page ?? 1) - 1) * (query.limit ?? 20),
          (query.page ?? 1) * (query.limit ?? 20),
        )
      : allRoles;

    const data = await Promise.all(
      rolesToFetch.map(async (role) => {
        const roleRecord = await this.roleRepo.findOne({
          where: { tenant: { id: tenantId }, role },
        });
        return {
          role,
          isActive: roleRecord?.isActive ?? true,
          permissions: await this.getForRole(tenantId, role),
        };
      }),
    );

    if (!isPaginated) {
      return { data, meta: { total } };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return { data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async getForRole(
    tenantId: string,
    role: UserRole,
  ): Promise<{ name: string; group: string; description: string; isActive: boolean }[]> {
    const rows = await this.rolePRepo.find({
      where: { tenant: { id: tenantId }, role },
      relations: ['permission'],
    });
    return rows.map((r) => ({
      name: r.permission.name,
      group: r.permission.group ?? '',
      description: r.permission.description ?? '',
      isActive: r.permission.isActive,
    }));
  }

  // ─── Cache Yönetimi ──────────────────────────────────────────────────────────

  invalidateCache(tenantId: string, role?: UserRole): void {
    if (role) {
      const key = `${tenantId}:${role}`;
      this.cache.delete(key);
      this.cacheExpiry.delete(key);
    } else {
      for (const key of [...this.cache.keys()]) {
        if (key.startsWith(tenantId)) {
          this.cache.delete(key);
          this.cacheExpiry.delete(key);
        }
      }
    }
  }

  private invalidateAllCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }
}
