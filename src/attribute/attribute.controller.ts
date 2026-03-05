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
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('Attributes')
@ApiBearerAuth('access-token')
@Controller('attributes')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AttributeController {
  constructor(private readonly attributeService: AttributeService) {}

  @Post()
  @ApiOperation({ summary: 'Yeni attribute olustur' })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_CREATE)
  create(@Body() dto: CreateAttributeDto) {
    return this.attributeService.createAttribute(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Tum attributeleri listele (degerleriyle)' })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_READ)
  findAll() {
    return this.attributeService.findAllAttributes();
  }

  @Get('paginated')
  @ApiOperation({ summary: 'Attribute listesini sayfali getir' })
  @ApiOkResponse({ type: PaginatedAttributesResponse })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_READ)
  findAllPaginated(
    @Query() query: ListAttributesQueryDto,
  ): Promise<PaginatedAttributesResponse> {
    return this.attributeService.findAllAttributesPaginated(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Belirli bir attribute getir' })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_READ)
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.attributeService.findOneAttribute(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Attribute guncelle' })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_UPDATE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeDto,
  ) {
    return this.attributeService.updateAttribute(id, dto);
  }

  @Delete()
  @ApiOperation({ summary: 'Attribute adina gore pasife al (soft delete)' })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_UPDATE)
  remove(@Body() dto: RemoveAttributeDto) {
    return this.attributeService.removeAttribute(dto);
  }

  @Post(':attributeValue/values')
  @ApiOperation({ summary: 'Attribute value alanina deger(ler) ekle' })
  @ApiBody({ type: CreateAttributeValueDto, isArray: true })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_CREATE)
  addValues(
    @Param('attributeValue', ParseIntPipe) attributeValue: number,
    @Body(new ParseArrayPipe({ items: CreateAttributeValueDto }))
    dtos: CreateAttributeValueDto[],
  ) {
    return this.attributeService.addValues(attributeValue, dtos);
  }

  @Patch('values/:id')
  @ApiOperation({ summary: 'Attribute value guncelle' })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_UPDATE)
  updateValue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAttributeValueDto,
  ) {
    return this.attributeService.updateValue(id, dto);
  }

  @Delete(':attributeValue/values')
  @ApiOperation({ summary: 'Attribute value ad/deger bilgisi ile pasife al' })
  @RequirePermission(Permissions.PRODUCT_ATTRIBUTE_UPDATE)
  removeValue(
    @Param('attributeValue', ParseIntPipe) attributeValue: number,
    @Body() dto: CreateAttributeValueDto,
  ) {
    return this.attributeService.removeValue(attributeValue, dto);
  }
}
