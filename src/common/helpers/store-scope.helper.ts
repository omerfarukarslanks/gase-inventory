import { NotFoundException } from '@nestjs/common';
import { EntityManager, In, Repository } from 'typeorm';
import { Store } from 'src/store/store.entity';
import { AppContextService } from 'src/common/context/app-context.service';
import { StoreErrors } from 'src/common/errors/store.errors';

/**
 * Merkezi store scope çözümleme tipi.
 *
 * Üç mod:
 *   - context-store : JWT'den gelen activeStoreId kullanılır (tek mağaza)
 *   - query-stores  : Query param'dan gelen storeIds kullanılır
 *   - tenant        : Mağaza filtresi yok — tenant genelinde tüm kayıtlar
 */
export type ResolvedScope = {
  mode: 'context-store' | 'query-stores' | 'tenant';
  /** Filtrelenecek store ID listesi; tenant modunda null */
  storeIds: string[] | null;
};

/**
 * Scope çözümleyici — Reports, Inventory ve diğer servislerin
 * aynı mantığı kullanması için merkezi helper.
 *
 * Kullanım:
 * ```ts
 * const scope = await resolveStoreScope(
 *   this.appContext,
 *   this.storeRepo,
 *   query.storeIds,
 *   manager,
 * );
 *
 * if (scope.storeIds) {
 *   qb.andWhere('e.storeId IN (:...storeIds)', { storeIds: scope.storeIds });
 * }
 * ```
 */
export async function resolveStoreScope(
  appContext: AppContextService,
  storeRepo: Repository<Store> | ReturnType<EntityManager['getRepository']>,
  queryStoreIds?: string[],
  manager?: EntityManager,
): Promise<ResolvedScope> {
  const tenantId      = appContext.getTenantIdOrThrow();
  const contextStoreId = appContext.getStoreId();
  const repo = manager ? manager.getRepository(Store) : (storeRepo as Repository<Store>);

  // Öncelik 1: JWT'deki activeStoreId
  if (contextStoreId) {
    const store = await repo.findOne({
      where: { id: contextStoreId, tenant: { id: tenantId } },
    });
    if (!store) throw new NotFoundException(StoreErrors.STORE_NOT_FOUND);
    return { mode: 'context-store', storeIds: [contextStoreId] };
  }

  // Öncelik 2: Query param storeIds
  const normalized = normalizeStoreIds(queryStoreIds);
  if (normalized.length > 0) {
    const found = await repo.find({
      where: { id: In(normalized), tenant: { id: tenantId } },
      select: { id: true },
    });
    if (found.length !== normalized.length) {
      throw new NotFoundException(StoreErrors.STORE_NOT_IN_TENANT);
    }
    return { mode: 'query-stores', storeIds: normalized };
  }

  // Öncelik 3: Tenant geneli — filtre yok
  return { mode: 'tenant', storeIds: null };
}

/** Query param'dan gelen storeIds'yi normalize eder (trim, deduplicate) */
export function normalizeStoreIds(storeIds?: string[]): string[] {
  return Array.from(
    new Set(
      (storeIds ?? [])
        .map((id) => id?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  );
}

/**
 * QueryBuilder'a scope WHERE koşulu uygular.
 *
 * tenant modunda hiçbir storeId filtresi eklenmez (sadece tenantId yeterli).
 */
export function applyScopeToQb(
  qb: any,
  scope: ResolvedScope,
  alias: string,
  storeIdColumn = 'storeId',
): void {
  if (scope.storeIds) {
    qb.andWhere(`${alias}.${storeIdColumn} IN (:...scopeStoreIds)`, {
      scopeStoreIds: scope.storeIds,
    });
  }
}
