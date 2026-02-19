import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ListSalesForStoreQueryDto } from './dto/list-sales.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';

@ApiTags('Sales')
@ApiBearerAuth('access-token') // DocumentBuilder içindeki key
@Controller('sales')
@UseGuards(JwtAuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni satış fişi oluştur ve stok düş' })
  createSale(@Body() dto: CreateSaleDto) {
    return this.salesService.createSale(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Satış fişini detaylarıyla getir' })
  getSale(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Satış fişini düzenle' })
  updateSale(@Param('id') id: string, @Body() dto: UpdateSaleDto) {
    return this.salesService.updateSale(id, dto);
  }

  @Get()
  @ApiOperation({
    summary:
      'Satis fislerini getir (context storeId varsa o store; yoksa storeIds filtresi; o da yoksa tenant geneli)',
  })
  getSalesForStore(@Query() query: ListSalesForStoreQueryDto) {
    return this.salesService.findAllForStore(query);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Satış fişini iptal et ve stok iadesi yap' })
  cancelSale(@Param('id') id: string, @Body() dto: CancelSaleDto) {
    return this.salesService.cancelSale(id, dto);
  }
}
