import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { ListVariantsDto } from './dto/list-variants.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ProductService } from './product.service';

@ApiTags('Products')
@ApiBearerAuth('access-token')
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productsService: ProductService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni urun olustur' })
  create(@Body() dto: CreateProductDto) {
    return this.productsService.createProduct(dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Urunleri listele (tokenda storeId varsa o magazaya bagli urunler, yoksa tenant urunleri)',
  })
  findAll(@Query() query: ListProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Belirli bir urunu getir' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Belirli bir urunu guncelle (token storeId varsa isActive store bazli uygulanir)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Belirli bir urunu pasife al (token storeId varsa yalnizca o store, yoksa tum tenant/storelar)',
  })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }

  @Post(':id/variants')
  @ApiOperation({ summary: 'Attribute secimlerine gore urun varyantlarini olustur/guncelle' })
  syncVariants(
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.syncVariants(productId, dto);
  }

  @Get(':id/variants')
  @ApiOperation({
    summary:
      'Urunun varyantlarini listele (tokenda storeId varsa o magazaya bagli varyantlar, yoksa tum varyantlar)',
  })
  listVariants(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query() query: ListVariantsDto,
  ) {
    return this.productsService.listVariants(productId, query);
  }

  @Get(':id/attributes')
  @ApiOperation({ summary: 'Urunun attribute secimlerini getir' })
  getProductAttributes(
    @Param('id', ParseUUIDPipe) productId: string,
  ) {
    return this.productsService.getProductAttributeSelections(productId);
  }

  @Patch(':id/variants/:variantId')
  @ApiOperation({
    summary:
      'Urun varyantini guncelle (isActive store bazli yonetilir: token storeId varsa sadece o store, yoksa tum storelar)',
  })
  updateVariant(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(productId, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @ApiOperation({
    summary:
      'Urun varyantini pasife al (token storeId varsa sadece o store, yoksa tum storelar)',
  })
  removeVariant(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return this.productsService.removeVariant(productId, variantId);
  }
}
