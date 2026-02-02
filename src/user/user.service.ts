import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User, UserRole } from './user.entity';
import { UserStore, StoreUserRole } from './user-store.entity';
import { TenantsService } from 'src/tenant/tenant.service';
import { StoresService } from 'src/store/store.service';
import * as bcrypt from 'bcrypt'
import { AppContextService } from 'src/common/context/app-context.service';
import { slugify } from 'src/common/utils/slugify';
import { UserErrors } from 'src/common/errors/user.errors';
import { Store } from 'src/store/store.entity';
import { generateRandomStoreName } from 'src/common/utils/random-store-name';
import { StoreErrors } from 'src/common/errors/store.errors';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly tenantsService: TenantsService,
    private readonly storesService: StoresService,
    private readonly appContext: AppContextService,
    private readonly dataSource: DataSource, 

    @InjectRepository(UserStore)
    private readonly userStoreRepo: Repository<UserStore>,
    @InjectRepository(Store)
    private readonly storeRepo: Repository<Store>,
  ) {}

    private getRepo(manager?: EntityManager): Repository<User> {
    return manager ? manager.getRepository(User) : this.userRepo;
  }

  findByEmail(email: string, manager?: EntityManager) {
    const repo: Repository<User> = this.getRepo(manager);
    return repo.findOne({ where: { email } });
  }

  findById(id: string, manager?: EntityManager) {
    const repo: Repository<User> = this.getRepo(manager);
    return repo.findOne({ where: { id } });
  }

  /**
   * Yeni tenant + default store + OWNER user + store ilişkisi
   */
  async createTenantWithOwner(input: {
    tenantName: string;
    tenantSlug: string;
    email: string;
    password: string;
    name: string;
    surname: string;
  }) {

   const userId = this.appContext.getUserIdOrNull();
    // Transaction dışından -> sadece çağrı
  return this.dataSource.transaction(async (manager) => {

    // 🔹 Transaction içindeki repo'lar
    const userRepo = manager.getRepository(User);
    const userStoreRepo = manager.getRepository(UserStore);

     // 1) Tenant oluştur
    const tenant = await this.tenantsService.create(
      input.tenantName,
      slugify(input.tenantName),
      manager
    );

    const randomName = generateRandomStoreName(tenant.name);
        // 2) Default store oluştur
    const store = await this.storesService.createDefaultStoreForTenant(tenant, randomName, manager);

    // 3) OWNER user oluştur
    const passwordHash = await bcrypt.hash(input.password, 10);

     // 4) E-posta adresi kullanımda mı kontrol et
    const existsEmail = await userRepo.exists({
      where: { email: input.email },
    });

    if (existsEmail) {
      throw new ConflictException(UserErrors.EMAIL_ALREADY_IN_USE);
    }

       // 5) User kaydı
    const user = userRepo.create({
      tenant: tenant, // Make sure 'tenant' is a relation in User entity
      email: input.email,
      name: input.name,
      surname: input.surname,
      passwordHash,
      role: UserRole.OWNER,
      ...(userId && {
        createdById: userId,
        updatedById: userId,
      }),
    });
    const savedUser = await userRepo.save(user);

    // 6) User–Store ilişkisinin kaydı
    const userStore = userStoreRepo.create({
      user: savedUser,
      store,
      role: StoreUserRole.MANAGER,
      ...(userId && {
        createdById: userId,
        updatedById: userId,
      }),
    });
    await userStoreRepo.save(userStore);

    // 7) Signup senaryosunda tenant/store createdById'yi owner'a bağla
    if (!userId) {
      tenant.createdById = savedUser.id;
      tenant.updatedById = savedUser.id;
      store.createdById = savedUser.id;
      store.updatedById = savedUser.id;

      await manager.save([tenant, store]);
    }

    return savedUser;
   });
  }

  async validateUser(email: string, password: string): Promise<User | null> {
    const user = await this.findByEmail(email);
    if (!user || !user.isActive) {
      this.logFailedLoginAttempt(email, user, user ? 'inactive' : 'not_found');
      return null;
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      this.logFailedLoginAttempt(email, user, 'invalid_password');
      return null;
    }

    return user;
  }

  private logFailedLoginAttempt(email: string, user: User | null, reason: string) {
    const ip = this.appContext.getIp() ?? '-';
    const correlationId = this.appContext.getCorrelationId() ?? '-';

    this.logger.warn(
      [
        'login_failed',
        `reason=${reason}`,
        `email=${email}`,
        `userId=${user?.id ?? '-'}`,
        `tenantId=${user?.tenant?.id ?? '-'}`,
        `ip=${ip}`,
        `correlationId=${correlationId}`,
      ].join(' | '),
    );
  }

  async existsByEmail(email: string) {
    return await this.userRepo.exists({ where: { email } });
  }

    // Tenant içi user oluşturma
  async createUserForTenant(input: {
    email: string;
    password: string;
    name: string;
    surname: string;
    role: UserRole;
    storeIds?: string[];  // ilk atamalar
  }): Promise<User> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorUserId = this.appContext.getUserIdOrNull();

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const userRepo = manager.getRepository(User);
      const userStoreRepo = manager.getRepository(UserStore);
      const storeRepo = manager.getRepository(Store);

      const exists = await userRepo.exists({ where: { email: input.email } });
      if (exists) {
        throw new ConflictException(UserErrors.EMAIL_ALREADY_IN_USE);
      }

      const passwordHash = await bcrypt.hash(input.password, 10);

      const user = userRepo.create({
        tenant: { id: tenantId } as any,
        email: input.email,
        name: input.name,
        surname: input.surname,
        passwordHash,
        role: input.role,
        isActive: true,
        createdById: actorUserId,
        updatedById: actorUserId,
      });

      const savedUser = await userRepo.save(user);

      // İstenen mağazalara ilişkilendir
      if (input.storeIds?.length) {
        for (const storeId of input.storeIds) {
          const store = await storeRepo.findOne({
            where: { id: storeId, tenant: { id: tenantId } },
          });
          if (!store) {
            throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
          }

          const us = userStoreRepo.create({
            user: savedUser,
            store,
            role: StoreUserRole.MANAGER, // istersen input'tan da alabiliriz
            createdById: actorUserId,
            updatedById: actorUserId,
          });
          await userStoreRepo.save(us);
        }
      }

      return savedUser;
    });
  }

    async updateUserForTenant(
    userId: string,
    input: {
      name?: string;
      surname?: string;
      role?: UserRole;
      isActive?: boolean;
    },
  ): Promise<User> {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorUserId = this.appContext.getUserIdOrThrow();

    const user = await this.userRepo.findOne({
      where: { id: userId, tenant: { id: tenantId } },
    });

    if (!user) {
      throw new NotFoundException(UserErrors.USER_NOT_FOUND);
    }

    if (input.name !== undefined) user.name = input.name;
    if (input.surname !== undefined) user.surname = input.surname;
    if (input.role !== undefined) user.role = input.role;
    if (input.isActive !== undefined) user.isActive = input.isActive;

    user.updatedById = actorUserId;

    return this.userRepo.save(user);
  }
   
  // Kullanıcıyı mağazaya ata
  async assignUserToStore(userId: string, storeId: string, role: StoreUserRole) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const actorUserId = this.appContext.getUserIdOrThrow();
    const user = await this.userRepo.findOne({
      where: { id: userId, tenant: { id: tenantId } },
    });
    if (!user) {
      throw new NotFoundException(UserErrors.USER_NOT_FOUND);
    }

    const store = await this.storeRepo.findOne({
      where: { id: storeId, tenant: { id: tenantId } },
    });
    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    const exists = await this.userStoreRepo.exists({
      where: { user: { id: userId }, store: { id: storeId } },
    });
    if (exists) {
      throw new BadRequestException(UserErrors.USER_ALREADY_IN_STORE);
    }

    const us = this.userStoreRepo.create({
      user,
      store,
      role,
      createdById: actorUserId,
      updatedById: actorUserId,
    });

    await this.userStoreRepo.save(us);
  }

  // Kullanıcıyı mağazadan kaldır
  async removeUserFromStore(userId: string, storeId: string) {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const us = await this.userStoreRepo.findOne({
      where: {
        user: { id: userId, tenant: { id: tenantId } },
        store: { id: storeId, tenant: { id: tenantId } },
      },
    });

    if (!us) {
      throw new NotFoundException(UserErrors.USER_NOT_IN_STORE);
    }

    await this.userStoreRepo.remove(us);
  }

    async getUserDetails(userId: string): Promise<User> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const user = await this.userRepo.findOne({
      where: { id: userId, tenant: { id: tenantId } },
      relations: ['tenant', 'userStores', 'userStores.store'],
    });

    if (!user) {
      throw new NotFoundException(UserErrors.USER_NOT_FOUND);
    }

    return user;
  }

  // Tenant içindeki tüm kullanıcıları listele
  async listUsersForTenant(): Promise<User[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    return this.userRepo.find({
      where: { tenant: { id: tenantId } },
      relations: ['userStores', 'userStores.store'],
      order: { createdAt: 'DESC' },
    });
  }

  // Belirli bir mağazaya atanmış kullanıcıları listele
  async listUsersForStore(storeId: string): Promise<User[]> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const store = await this.storeRepo.findOne({
      where: { id: storeId, tenant: { id: tenantId } },
    });
    if (!store) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }

    const userStores = await this.userStoreRepo.find({
      where: { store: { id: storeId }, user: { tenant: { id: tenantId } } },
      relations: ['user'],
    });

    return userStores.map((us) => us.user);
  }

  async deleteUser(userId: string): Promise<void> {
    const tenantId = this.appContext.getTenantIdOrThrow();

    return this.dataSource.transaction(async (manager: EntityManager) => {
      const userRepo = manager.getRepository(User);
      const userStoreRepo = manager.getRepository(UserStore);

      const user = await userRepo.findOne({
        where: { id: userId, tenant: { id: tenantId } },
      });

      if (!user) {
        throw new NotFoundException(UserErrors.USER_NOT_FOUND);
      }

      await userStoreRepo.delete({ user: { id: userId } });
      await userRepo.remove(user);
    });
  }
}
