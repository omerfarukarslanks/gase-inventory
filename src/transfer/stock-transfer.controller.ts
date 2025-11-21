import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { StockTransferService } from './stock-transfer.service';
import { StockTransfer } from './stock-transfer.entity';
import { CreateStockTransferDto } from './create-stock-transfer.dto';
// import { UseGuards } from '@nestjs/common';
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('stock-transfers')
// @UseGuards(JwtAuthGuard)
@Controller('transfers')
export class StockTransferController {
  constructor(private readonly stockTransferService: StockTransferService) {}

  @Post()
  @ApiOperation({
    summary: 'Mağazalar arası ürün transferi oluştur ve stok hareketlerini uygula',
  })
  async createTransfer(
    @Body() dto: CreateStockTransferDto,
  ): Promise<StockTransfer> {
    return this.stockTransferService.createAndExecuteTransfer(dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Transfer fişini detaylarıyla getir',
  })
  async getTransfer(@Param('id') id: string): Promise<StockTransfer> {
    return this.stockTransferService.findById(id);
  }

  // İstersen ek:
  // GET /transfers/store/:storeId -> ilgili mağazanı ilgilendiren transferler
}
