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
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { CreateVariantDto } from './dto/create-variant.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ProductService } from './product.service';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ListProductsQueryDto } from './dto/list-products.dto';

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
  findAll(@Query() query: ListProductsQueryDto) {
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
  @ApiOperation({ summary: 'Belirli bir ürünü sil' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.productsService.remove(id);
  }

  // ---------- Variant endpoints ----------

  @Post(':id/variants')
  @ApiOperation({ summary: 'Ürüne varyant ekle' })
  addVariant(
    @Param('id', ParseUUIDPipe) productId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.productsService.addVariant(productId, dto);
  }

  @Get(':id/variants')
  @ApiOperation({ summary: 'Ürünün tüm varyantlarını listele' })
  listVariants(@Param('id', ParseUUIDPipe) productId: string) {
    return this.productsService.listVariants(productId);
  }
}
