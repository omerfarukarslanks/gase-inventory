import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers.dto';

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni müşteri oluştur' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Müşterileri listele (page/limit verilirse sayfalı döner, verilmezse tümü döner)',
  })
  findAll(@Query() query: ListCustomersQueryDto) {
    return this.customerService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Belirli bir müşteriyi getir' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Müşteriyi güncelle' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Müşteriyi pasife al (soft delete)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.remove(id);
  }

  @Get(':id/balance')
  @ApiOperation({
    summary: 'Müşteri cari bakiyesi — toplam satış, ödeme, iade ve kalan borç',
  })
  getBalance(@Param('id', ParseUUIDPipe) id: string) {
    return this.customerService.getCustomerBalance(id);
  }
}
