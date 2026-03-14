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
import { ListSaleReturnsDto } from './dto/list-sale-returns.dto';
import { SalesService } from './sales.service';

@ApiTags('Sales Returns')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('sales/returns')
export class SalesReturnCenterController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @ApiOperation({ summary: 'Merkezi iade kayitlarini listele' })
  @RequirePermission(Permissions.SALE_RETURN_READ)
  listSaleReturns(@Query() query: ListSaleReturnsDto) {
    return this.salesService.listAllSaleReturns(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Merkezi iade detayini getir' })
  @RequirePermission(Permissions.SALE_RETURN_READ)
  getSaleReturn(@Param('id', ParseUUIDPipe) id: string) {
    return this.salesService.getSaleReturn(id);
  }
}
