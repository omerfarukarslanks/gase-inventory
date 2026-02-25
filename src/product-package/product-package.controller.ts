import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { ProductPackageService } from './product-package.service';
import { CreatePackageDto } from '../product-package/dto/create-package.dto';
import { UpdatePackageDto } from '../product-package/dto/update-package.dto';
import { ListPackagesDto } from '../product-package/dto/list-packages.dto';
import { PackageResponse } from '../product-package/dto/package-response.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';

@ApiTags('Product Packages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('access-token')
@Controller('product-packages')
export class ProductPackageController {
  constructor(private readonly packageService: ProductPackageService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni paket tanımı oluştur' })
  async create(@Body() dto: CreatePackageDto) {
    return PackageResponse.fromEntity(await this.packageService.create(dto));
  }

  @Get()
  @ApiOperation({ summary: 'Tenant\'a ait tüm paketleri listele' })
  async findAll(@Query() query: ListPackagesDto) {
    const result = await this.packageService.findAll(query);
    return { ...result, data: result.data.map(PackageResponse.fromEntity) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Paket detayını getir' })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return PackageResponse.fromEntity(await this.packageService.findOneOrThrow(id));
  }

  @Get(':id/stock/:storeId')
  @ApiOperation({
    summary: 'Belirtilen mağazada paketten kaç adet satılabilir olduğunu hesapla',
  })
  getStock(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('storeId', ParseUUIDPipe) storeId: string,
  ) {
    return this.packageService.getPackageAvailableStock(id, storeId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Paket bilgilerini güncelle (items gönderilirse tüm liste değişir)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackageDto,
  ) {
    return PackageResponse.fromEntity(await this.packageService.update(id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Paketi pasife çek (soft-delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.packageService.remove(id);
  }
}
