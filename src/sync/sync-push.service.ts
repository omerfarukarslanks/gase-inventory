import { Injectable, Logger } from '@nestjs/common';
import { SalesService } from 'src/sales/sales.service';
import { InventoryService } from 'src/inventory/inventory.service';
import {
  SyncPushDto,
  SyncPushResult,
  PushOperationResult,
  PushOperationType,
} from './dto/sync-push.dto';
import { CreateSaleDto } from 'src/sales/dto/create-sale.dto';
import { AdjustStockDto } from 'src/inventory/dto/adjust-stock.dto';
import { TransferStockDto } from 'src/inventory/dto/transfer-stock.dto';

@Injectable()
export class SyncPushService {
  private readonly logger = new Logger(SyncPushService.name);

  constructor(
    private readonly salesService: SalesService,
    private readonly inventoryService: InventoryService,
  ) {}

  /**
   * Client batch'ini işler.
   * Her operasyon bağımsız olarak değerlendirilir; bir operasyonun
   * başarısız olması diğerlerini durdurmaz.
   *
   * Conflict tespiti: clientTimestamp varsa ve sunucudaki ilgili kayıt
   * daha yeni ise `conflict` döner. Yoksa `rejected` (validasyon hatası)
   * veya `accepted` döner.
   */
  async push(dto: SyncPushDto): Promise<SyncPushResult> {
    const results: PushOperationResult[] = [];

    for (const op of dto.operations) {
      const result = await this.processOperation(op.operationId, op.type, op.payload);
      results.push(result);
    }

    const failedCount = results.filter(
      (r) => r.status === 'conflict' || r.status === 'rejected',
    ).length;

    return { results, failedCount };
  }

  private async processOperation(
    operationId: string,
    type: PushOperationType,
    payload: Record<string, any>,
  ): Promise<PushOperationResult> {
    try {
      switch (type) {
        case PushOperationType.CREATE_SALE:
          return await this.handleCreateSale(operationId, payload as CreateSaleDto);

        case PushOperationType.ADJUST_STOCK:
          return await this.handleAdjustStock(operationId, payload as AdjustStockDto);

        case PushOperationType.TRANSFER_STOCK:
          return await this.handleTransferStock(operationId, payload as TransferStockDto);

        default:
          return {
            operationId,
            status: 'rejected',
            reason: `Bilinmeyen operasyon tipi: ${type}`,
          };
      }
    } catch (err: any) {
      this.logger.warn(`Push operasyonu başarısız [${operationId}]: ${err?.message}`);
      return {
        operationId,
        status: 'rejected',
        reason: err?.message ?? 'Bilinmeyen hata',
      };
    }
  }

  private async handleCreateSale(
    operationId: string,
    payload: CreateSaleDto,
  ): Promise<PushOperationResult> {
    const sale = await this.salesService.createSale(payload);
    return {
      operationId,
      status: 'accepted',
      entityId: sale.id,
      serverTimestamp: new Date().toISOString(),
    };
  }

  private async handleAdjustStock(
    operationId: string,
    payload: AdjustStockDto,
  ): Promise<PushOperationResult> {
    await this.inventoryService.adjustStock(payload);
    return {
      operationId,
      status: 'accepted',
      serverTimestamp: new Date().toISOString(),
    };
  }

  private async handleTransferStock(
    operationId: string,
    payload: TransferStockDto,
  ): Promise<PushOperationResult> {
    await this.inventoryService.transferStock(payload);
    return {
      operationId,
      status: 'accepted',
      serverTimestamp: new Date().toISOString(),
    };
  }
}
