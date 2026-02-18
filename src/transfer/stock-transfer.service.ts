// src/transfer/stock-transfer.service.ts
import {
    Injectable,
    BadRequestException,
} from '@nestjs/common';
import { DataSource, DeepPartial, EntityManager, Repository } from 'typeorm';

import { StockTransfer } from './stock-transfer.entity';
import { StockTransferLine } from './stock-transfer-line.entity';
import { StockTransferStatus } from './stock-transfer-status.enum';
import { AppContextService } from '../common/context/app-context.service';
import { InventoryService } from '../inventory/inventory.service';
import { Store } from '../store/store.entity';
import { ProductVariant } from '../product/product-variant.entity';
import { InventoryErrors } from '../common/errors/inventory.errors';
import { CreateStockTransferDto } from './create-stock-transfer.dto';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class StockTransferService {
    constructor(
        private readonly appContext: AppContextService,
        private readonly inventoryService: InventoryService,
        private readonly dataSource: DataSource,
        @InjectRepository(StockTransfer)
        private readonly transferRepo: Repository<StockTransfer>,
    ) { }

    private getTransferRepo(manager?: EntityManager): Repository<StockTransfer> {
        return manager ? manager.getRepository(StockTransfer) : this.transferRepo;
    }

    async createAndExecuteTransfer(dto: CreateStockTransferDto, manager?: EntityManager): Promise<StockTransfer> {
        if (dto.fromStoreId === dto.toStoreId) {
            throw new BadRequestException(InventoryErrors.SAME_SOURCE_AND_TARGET_STORE);
        }

        if (!dto.lines || dto.lines.length === 0) {
            throw new BadRequestException('TRANSFER_MUST_HAVE_LINES');
        }

        const tenantId = this.appContext.getTenantIdOrThrow();
        const userId = this.appContext.getUserIdOrThrow();

        const handler = async (manager: EntityManager) => {
            const transferRepo = manager.getRepository(StockTransfer);
            const lineRepo = manager.getRepository(StockTransferLine);
            const storeRepo = manager.getRepository(Store);
            const variantRepo = manager.getRepository(ProductVariant);

            const fromStore = await storeRepo.findOne({
                where: { id: dto.fromStoreId, tenant: { id: tenantId } },
            });
            const toStore = await storeRepo.findOne({
                where: { id: dto.toStoreId, tenant: { id: tenantId } },
            });

            if (!fromStore || !toStore) {
                throw new BadRequestException(
                    InventoryErrors.STORE_NOT_FOUND_FOR_TENANT,
                );
            }

            // Varyantları cache’leyelim
            const variantMap = new Map<string, ProductVariant>();
            for (const line of dto.lines) {
                if (!variantMap.has(line.productVariantId)) {
                    const variant = await variantRepo.findOne({
                        where: {
                            id: line.productVariantId,
                            product: { tenant: { id: tenantId } },
                        },
                        relations: ['product', 'product.tenant'],
                    });

                    if (!variant) {
                        throw new BadRequestException(
                            InventoryErrors.VARIANT_NOT_FOUND_FOR_TENANT,
                        );
                    }

                    variantMap.set(line.productVariantId, variant);
                }
            }

            // 1) Transfer başlığını oluştur
            const transfer = transferRepo.create({
                tenant: { id: tenantId } as any,
                fromStore: { id: fromStore.id } as any,
                toStore: { id: toStore.id } as any,
                status: StockTransferStatus.COMPLETED, // şimdilik tek adımda tamamlıyoruz
                note: dto.note,
                createdById: userId,
                updatedById: userId,
            });

            const savedTransfer = await transferRepo.save(transfer);

            const lines: StockTransferLine[] = [];

            // 2) Her satır için stok kontrolü + hareketler + stok özetlerini kaydet
            for (const lineDto of dto.lines) {
                const variant = variantMap.get(lineDto.productVariantId)!;

                // Gönderen ve alan mağaza stoklarını transfer ÖNCESİ al
                const fromBefore = await this.inventoryService.getStockForVariantInStore(
                    fromStore.id,
                    variant.id,
                    manager,
                );
                const toBefore = await this.inventoryService.getStockForVariantInStore(
                    toStore.id,
                    variant.id,
                    manager,
                );

                if (fromBefore < lineDto.quantity) {
                    throw new BadRequestException({
                        ...InventoryErrors.NOT_ENOUGH_STOCK,
                        details: {
                            storeId: fromStore.id,
                            productVariantId: variant.id,
                            currentStock: fromBefore,
                            requested: lineDto.quantity,
                        },
                    });
                }

                // InventoryService.transferStock ile hareketleri yaz
                await this.inventoryService.transferStock(
                    {
                        fromStoreId: fromStore.id,
                        toStoreId: toStore.id,
                        productVariantId: variant.id,
                        quantity: lineDto.quantity,
                        reference: dto.reference ?? `TRANSFER-${savedTransfer.id}`,
                        meta: {
                            transferId: savedTransfer.id,
                        },
                    },
                    manager,
                );

                // After stokları (matematiksel olarak hesaplayabiliriz)
                const fromAfter = fromBefore - lineDto.quantity;
                const toAfter = toBefore + lineDto.quantity;

                const line = lineRepo.create({
                    transfer: { id: savedTransfer.id } as any,
                    productVariant: { id: variant.id } as any,
                    quantity: lineDto.quantity,
                    fromStoreStockBefore: fromBefore,
                    fromStoreStockAfter: fromAfter,
                    toStoreStockBefore: toBefore,
                    toStoreStockAfter: toAfter,
                    createdById: userId,
                    updatedById: userId,
                } as DeepPartial<StockTransferLine>);

                const savedLine = await lineRepo.save(line);
                lines.push(savedLine);
            }

            savedTransfer.lines = lines;
            return savedTransfer;
        };

        if (manager) {
            return handler(manager);
        }

        return this.dataSource.transaction(handler);
    }

    async findById(id: string, manager?: EntityManager): Promise<StockTransfer> {
        const tenantId = this.appContext.getTenantIdOrThrow();

        const transfer = await this.getTransferRepo(manager).findOne({
            where: { id, tenant: { id: tenantId } },
            relations: ['fromStore', 'toStore', 'lines', 'lines.productVariant'],
        });

        if (!transfer) {
            throw new BadRequestException('STOCK_TRANSFER_NOT_FOUND');
        }

        return transfer;
    }
}
