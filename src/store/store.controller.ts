import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { StoresService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { ApiOkResponse, ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { ListStoresQueryDto, PaginatedStoresResponse } from './dto/list-stores.dto';

@ApiTags('Stores')
@ApiBearerAuth('access-token')
@Controller('stores')
@UseGuards(JwtAuthGuard)
export class StoreController {
  constructor(private readonly storesService: StoresService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni mağaza oluştur' })
  create(@Body() dto: CreateStoreDto) {
    return this.storesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Mevcut tenant için tüm mağazaları listele' })
  @ApiOkResponse({
    description: 'Paginated list of stores',
    type: PaginatedStoresResponse,
  })
  findAll(@Query() query: ListStoresQueryDto) {
    return this.storesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Belirli bir mağazayı getir' })
  findOne(@Param('id') id: string) {
    return this.storesService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Belirli bir mağazayı güncelle' })
  update(@Param('id') id: string, @Body() dto: UpdateStoreDto) {
    return this.storesService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Belirli bir mağazayı pasife al (soft delete)' })
  remove(@Param('id') id: string) {
    return this.storesService.remove(id);
  }
}
