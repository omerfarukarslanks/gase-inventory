import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseArrayPipe,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiBody, ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { AttributeService } from './attribute.service';
import { CreateAttributeDto } from './dto/create-attribute.dto';
import { CreateAttributeValueDto } from './dto/create-attribute-value.dto';
import {
  ListAttributesQueryDto,
  PaginatedAttributesResponse,
} from './dto/list-attributes.dto';
import { RemoveAttributeDto } from './dto/remove-attribute.dto';
import { UpdateAttributeDto } from './dto/update-attribute.dto';
import { UpdateAttributeValueDto } from './dto/update-attribute-value.dto';

@ApiTags('Attributes')
@ApiBearerAuth('access-token')
@Controller('attributes')
@UseGuards(JwtAuthGuard)
export class AttributeController {
  constructor(private readonly attributeService: AttributeService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni attribute olustur' })
  create(@Body() dto: CreateAttributeDto) {
    return this.attributeService.createAttribute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tum attributeleri listele (degerleriyle)' })
  findAll() {
    return this.attributeService.findAllAttributes();
  }

  @Get('paginated')
  @ApiOperation({ summary: 'Attribute listesini sayfali getir' })
  @ApiOkResponse({
    description: 'Paginated list of attributes',
    type: PaginatedAttributesResponse,
  })
  findAllPaginated(
    @Query() query: ListAttributesQueryDto,
  ): Promise<PaginatedAttributesResponse> {
    return this.attributeService.findAllAttributesPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Belirli bir attribute getir' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attributeService.findOneAttribute(id);
  }

  @Patch()
  @ApiOperation({ summary: 'Attribute adina gore guncelle' })
  update(@Body() dto: UpdateAttributeDto) {
    return this.attributeService.updateAttribute(dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Attribute adina gore pasife al (soft delete)' })
  remove(@Body() dto: RemoveAttributeDto) {
    return this.attributeService.removeAttribute(dto);
  }

  @Post(':attributeValue/values')
  @ApiOperation({ summary: 'Attribute value alanina deger(ler) ekle' })
  @ApiBody({ type: CreateAttributeValueDto, isArray: true })
  addValues(
    @Param('attributeValue', ParseIntPipe) attributeValue: number,
    @Body(new ParseArrayPipe({ items: CreateAttributeValueDto }))
    dtos: CreateAttributeValueDto[],
  ) {
    return this.attributeService.addValues(attributeValue, dtos);
  }

  @Patch(':attributeValue/values')
  @ApiOperation({ summary: 'Attribute value ad/deger bilgisi ile guncelle' })
  updateValue(
    @Param('attributeValue', ParseIntPipe) attributeValue: number,
    @Body() dto: UpdateAttributeValueDto,
  ) {
    return this.attributeService.updateValue(attributeValue, dto);
  }

  @Delete(':attributeValue/values')
  @ApiOperation({ summary: 'Attribute value ad/deger bilgisi ile pasife al' })
  removeValue(
    @Param('attributeValue', ParseIntPipe) attributeValue: number,
    @Body() dto: CreateAttributeValueDto,
  ) {
    return this.attributeService.removeValue(attributeValue, dto);
  }
}
