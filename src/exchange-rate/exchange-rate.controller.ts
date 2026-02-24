import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { ExchangeRateService } from './exchange-rate.service';

@ApiTags('Exchange Rates')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('exchange-rates')
export class ExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Get()
  @ApiOperation({ summary: 'Güncel döviz kurlarını listele (USD/TRY, EUR/TRY)' })
  getAll() {
    return this.service.getAllRates();
  }
}
