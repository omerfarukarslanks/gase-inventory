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
import { ProductCategoryService } from './product-category.service';
import { CreateProductCategoryDto } from './dto/create-product-category.dto';
import { UpdateProductCategoryDto } from './dto/update-product-category.dto';
import { ListProductCategoriesQueryDto } from './dto/list-product-categories.dto';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('Product Categories')
@ApiBearerAuth('access-token')
@Controller('product-categories')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ProductCategoryController {
  constructor(private readonly categoryService: ProductCategoryService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni kategori oluştur' })
  @RequirePermission(Permissions.PRODUCT_CATEGORY_CREATE)
  create(@Body() dto: CreateProductCategoryDto) {
    return this.categoryService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Kategorileri listele' })
  @RequirePermission(Permissions.PRODUCT_CATEGORY_READ)
  findAll(@Query() query: ListProductCategoriesQueryDto) {
    return this.categoryService.findAll(query);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Kategorileri ağaç yapısıyla getir (children iç içe)' })
  @RequirePermission(Permissions.PRODUCT_CATEGORY_READ)
  findTree() {
    return this.categoryService.findTree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Tek kategori getir' })
  @RequirePermission(Permissions.PRODUCT_CATEGORY_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.findOneOrThrow(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Kategori güncelle' })
  @RequirePermission(Permissions.PRODUCT_CATEGORY_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.categoryService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Kategori pasife al' })
  @RequirePermission(Permissions.PRODUCT_CATEGORY_UPDATE)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.remove(id);
  }
}
