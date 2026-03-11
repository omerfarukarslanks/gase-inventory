import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiProperty } from '@nestjs/swagger';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { IsNumber, IsPositive } from 'class-validator';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ExchangeRateService } from './exchange-rate.service';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

class SetRateOverrideDto {
  @ApiProperty({ example: 38.5, description: '1 birim = kaç TRY' })
  @IsNumber()
  @IsPositive()
  rateToTry: number;
}

@ApiTags('Exchange Rates')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('exchange-rates')
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get()
  @ApiOperation({ summary: 'Güncel döviz kurlarını listele — global + tenant override birleşik' })
  @RequirePermission(Permissions.EXCHANGE_RATE_READ)
  getAll() {
    return this.service.getAllRates();
  }

  @Put('overrides/:currency')
  @ApiOperation({ summary: 'Tenant\'a özel kur override ekle/güncelle' })
  @ApiBody({ type: SetRateOverrideDto })
  @RequirePermission(Permissions.EXCHANGE_RATE_MANAGE)
  setOverride(
    @Param('currency') currency: string,
    @Body() dto: SetRateOverrideDto,
  ) {
    return this.service.setTenantRateOverride(currency.toUpperCase(), dto.rateToTry);
  }

  @Delete('overrides/:currency')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tenant\'a özel kur override\'ını kaldır (global kura dön)' })
  @RequirePermission(Permissions.EXCHANGE_RATE_MANAGE)
  removeOverride(@Param('currency') currency: string) {
    return this.service.removeTenantRateOverride(currency.toUpperCase());
  }
}
