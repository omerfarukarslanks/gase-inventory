import {
  BadRequestException,
  UseGuards,
  Controller,
  Get,
  Param,
  Put,
  Delete,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { StoreProductPrice } from './store-product-price.entity';
import { PriceService } from './price.service';
import { AppContextService } from '../common/context/app-context.service';
import { SetStorePriceDto } from './dto/set-store-price.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('Store Prices')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('store-prices')
export class StoreProductPricesController {
  constructor(
    private readonly priceService: PriceService,

    @InjectRepository(StoreProductPrice)
    private readonly sppRepo: Repository<StoreProductPrice>,

    private readonly appContext: AppContextService,
  ) {}

  @Get(':storeId')
  @ApiOperation({ summary: 'Belirli bir mağaza için tüm fiyat override kayıtlarını listele' })
  @RequirePermission(Permissions.PRICE_READ)
  async listForStore(@Param('storeId') storeId: string) {
    const tenantId = this.appContext.getTenantIdOrThrow();
    const list = await this.sppRepo.find({
      where: { tenant: { id: tenantId }, store: { id: storeId }, isActive: true },
      relations: ['productVariant'],
      order: { updatedAt: 'DESC' },
    });
    return list;
  }

  @Get(':storeId/:variantId/effective')
  @ApiOperation({ summary: 'Mağaza + varyant için efektif fiyatı getir' })
  @RequirePermission(Permissions.PRICE_READ)
  async getEffectiveForStoreVariant(
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.priceService.getEffectiveSaleParamsForStore(storeId, variantId);
  }

  @Put(':variantId')
  @ApiOperation({ summary: 'Varyant için mağaza özel fiyat/vergi/indirim tanımla veya güncelle' })
  @RequirePermission(Permissions.PRICE_MANAGE)
  async setStorePrice(
    @Param('variantId') variantId: string,
    @Body() dto: SetStorePriceDto,
  ) {
    const isMultiTarget =
      dto.applyToAllStores === true ||
      (dto.storeIds?.length ?? 0) > 0;

    if (!isMultiTarget && dto.storeId) {
      return this.priceService.setStorePriceForVariant({
        storeId: dto.storeId,
        productVariantId: variantId,
        unitPrice: dto.unitPrice,
        currency: dto.currency,
        discountPercent: dto.discountPercent,
        discountAmount: dto.discountAmount,
        taxPercent: dto.taxPercent,
        taxAmount: dto.taxAmount,
        campaignCode: dto.campaignCode,
      });
    }

    if (!isMultiTarget && !dto.storeId) {
      throw new BadRequestException(
        'storeId, storeIds veya applyToAllStores alanlarından biri gönderilmelidir.',
      );
    }

    return this.priceService.setStorePriceForVariantMulti({
      storeId: dto.storeId,
      productVariantId: variantId,
      storeIds: dto.storeIds,
      applyToAllStores: dto.applyToAllStores,
      unitPrice: dto.unitPrice,
      currency: dto.currency,
      discountPercent: dto.discountPercent,
      discountAmount: dto.discountAmount,
      taxPercent: dto.taxPercent,
      taxAmount: dto.taxAmount,
      campaignCode: dto.campaignCode,
    });
  }

  @Put('product/:productId')
  @ApiOperation({ summary: 'Ürünün tüm varyantlarına mağaza bazlı fiyat uygula' })
  @RequirePermission(Permissions.PRICE_MANAGE)
  async setStorePriceForProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @Body() dto: SetStorePriceDto,
  ) {
    const contextStoreId = this.appContext.getStoreId();
    return this.priceService.setStorePriceForProduct({
      productId,
      storeId: contextStoreId ?? dto.storeId,
      storeIds: dto.storeIds,
      applyToAllStores: dto.applyToAllStores,
      unitPrice: dto.unitPrice,
      currency: dto.currency,
      discountPercent: dto.discountPercent,
      discountAmount: dto.discountAmount,
      taxPercent: dto.taxPercent,
      taxAmount: dto.taxAmount,
      campaignCode: dto.campaignCode,
    });
  }

  @Delete(':storeId/:variantId')
  @ApiOperation({ summary: 'Mağaza + varyant fiyat override kaydını kaldır' })
  @RequirePermission(Permissions.PRICE_MANAGE)
  async clearStoreOverride(
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
  ) {
    await this.priceService.clearStoreOverride(storeId, variantId);
    return { success: true };
  }
}
