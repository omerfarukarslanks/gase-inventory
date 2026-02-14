import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';
import { ListVariantsDto } from './dto/list-variants.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ProductService } from './product.service';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ListProductsDto } from './dto/list-products.dto';
import { ApiBody } from '@nestjs/swagger';

@ApiTags('Products')
@ApiBearerAuth('access-token') // DocumentBuilder içindeki key
@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductController {
  constructor(private readonly productsService: ProductService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni ürün oluştur' })
  create(
    @Body() dto: CreateProductDto
  ) {
    return this.productsService.createProduct(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Mevcut tenant için tüm ürünleri listele' })
  findAll(@Query() query: ListProductsDto) {
    return this.productsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Belirli bir ürünü getir' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Belirli bir ürünü güncelle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Belirli bir ürünü pasife al (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }

  // ---------- Variant endpoints ----------

  @Post(':id/variants')
  @ApiOperation({ summary: 'Ürüne varyant(lar) ekle' })
  @ApiBody({ type: CreateVariantDto, isArray: true })
  addVariant(
    @Param('id', ParseUUIDPipe) productId: string,
    @Body(new ParseArrayPipe({ items: CreateVariantDto })) dtos: CreateVariantDto[],
  ) {
    return this.productsService.addVariants(productId, dtos);
  }

  @Get(':id/variants')
  @ApiOperation({ summary: 'Ürünün varyantlarını listele (varsayılan: aktif)' })
  listVariants(
    @Param('id', ParseUUIDPipe) productId: string,
    @Query() query: ListVariantsDto,
  ) {
    return this.productsService.listVariants(productId, query);
  }

  @Patch(':id/variants/:variantId')
  @ApiOperation({ summary: 'Ürün varyantını güncelle' })
  updateVariant(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.productsService.updateVariant(productId, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @ApiOperation({ summary: 'Ürün varyantını pasife al (soft delete)' })
  removeVariant(
    @Param('id', ParseUUIDPipe) productId: string,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ) {
    return this.productsService.removeVariant(productId, variantId);
  }
}
