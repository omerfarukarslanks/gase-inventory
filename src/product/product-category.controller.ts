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

@ApiTags('Product Categories')
@ApiBearerAuth('access-token')
@Controller('product-categories')
@UseGuards(JwtAuthGuard)
export class ProductCategoryController {
  constructor(private readonly categoryService: ProductCategoryService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni kategori oluştur' })
  create(@Body() dto: CreateProductCategoryDto) {
    return this.categoryService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Kategorileri düz liste olarak getir' })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.categoryService.findAll(includeInactive === 'true');
  }

  @Get('tree')
  @ApiOperation({ summary: 'Kategorileri ağaç yapısıyla getir (children iç içe)' })
  findTree() {
    return this.categoryService.findTree();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Tek kategori getir' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.findOneOrThrow(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Kategori güncelle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductCategoryDto,
  ) {
    return this.categoryService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Kategori pasife al' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.categoryService.remove(id);
  }
}
