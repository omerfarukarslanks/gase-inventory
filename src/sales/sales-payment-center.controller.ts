import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { ListSalePaymentsDto } from './dto/list-sale-payments.dto';
import { SalesService } from './sales.service';

@ApiTags('Sales Payments')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('sales/payments')
export class SalesPaymentCenterController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Merkezi odeme kayitlarini listele' })
  @RequirePermission(Permissions.SALE_PAYMENT_READ)
  listSalePayments(@Query() query: ListSalePaymentsDto) {
    return this.salesService.listAllSalePayments(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Merkezi odeme detayini getir' })
  @RequirePermission(Permissions.SALE_PAYMENT_READ)
  getSalePayment(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.getSalePayment(id);
  }
}
