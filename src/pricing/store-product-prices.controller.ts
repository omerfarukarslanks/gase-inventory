import {
  Controller,
  Get,
  Param,
  Put,
  Delete,
  Body,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

import { StoreProductPrice } from './store-product-price.entity';
import { PriceService } from './price.service';
import { AppContextService } from '../common/context/app-context.service';
import { SetStorePriceDto } from './dto/set-store-price.dto';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { UseGuards } from '@nestjs/common';

@ApiTags('store-prices')
// @UseGuards(JwtAuthGuard)
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
  async listForStore(@Param('storeId') storeId: string) {
    const tenantId = this.appContext.getTenantIdOrThrow();

    const list = await this.sppRepo.find({
      where: {
        tenant: { id: tenantId },
        store: { id: storeId },
      },
      relations: ['productVariant'],
      order: { updatedAt: 'DESC' },
    });

    return list;
  }

  @Get(':storeId/:variantId/effective')
  @ApiOperation({
    summary: 'Mağaza + varyant için efektif fiyatı (tenant + override birleşimi) getir',
  })
  async getEffectiveForStoreVariant(
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
  ) {
    return this.priceService.getEffectiveSaleParamsForStore(
      storeId,
      variantId,
    );
  }

  @Put(':storeId/:variantId')
  @ApiOperation({
    summary: 'Mağaza + varyant için özel fiyat/vergi/indirim tanımla veya güncelle',
  })
  async setStorePrice(
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
    @Body() dto: SetStorePriceDto,
  ) {
    const result = await this.priceService.setStorePriceForVariant({
      storeId,
      productVariantId: variantId,
      salePrice: dto.salePrice ?? null,
      currency: dto.currency,
      taxPercent: dto.taxPercent ?? null,
      discountPercent: dto.discountPercent ?? null,
    });

    return result;
  }

  @Delete(':storeId/:variantId')
  @ApiOperation({
    summary: 'Mağaza + varyant fiyat override kaydını kaldır (tenant default fiyata dön)',
  })
  async clearStoreOverride(
    @Param('storeId') storeId: string,
    @Param('variantId') variantId: string,
  ) {
    await this.priceService.clearStoreOverride(storeId, variantId);
    return { success: true };
  }
}
