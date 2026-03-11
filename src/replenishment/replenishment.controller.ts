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
import { ApiTags } from '@nestjs/swagger/dist/decorators/api-use-tags.decorator';
import { ApiOperation } from '@nestjs/swagger/dist/decorators/api-operation.decorator';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { ReplenishmentService } from './replenishment.service';
import { CreateReplenishmentRuleDto } from './dto/create-replenishment-rule.dto';
import { UpdateReplenishmentRuleDto } from './dto/update-replenishment-rule.dto';
import { ListReplenishmentRulesDto } from './dto/list-replenishment-rules.dto';
import { ListReplenishmentSuggestionsDto } from './dto/list-replenishment-suggestions.dto';
import { DismissSuggestionDto } from './dto/dismiss-suggestion.dto';

@ApiTags('Replenishment')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('replenishment')
export class ReplenishmentController {
  constructor(private readonly replenishmentService: ReplenishmentService) {}

  // ─── Rules ────────────────────────────────────────────────────────────────

  @Post('rules')
  @ApiOperation({ summary: 'Yeni replenishment kuralı oluştur' })
  @RequirePermission(Permissions.REPLENISHMENT_RULE_MANAGE)
  createRule(@Body() dto: CreateReplenishmentRuleDto) {
    return this.replenishmentService.createRule(dto);
  }

  @Get('rules')
  @ApiOperation({ summary: 'Replenishment kurallarını listele' })
  @RequirePermission(Permissions.REPLENISHMENT_READ)
  listRules(@Query() query: ListReplenishmentRulesDto) {
    return this.replenishmentService.listRules(query);
  }

  @Get('rules/:id')
  @ApiOperation({ summary: 'Replenishment kuralını getir' })
  @RequirePermission(Permissions.REPLENISHMENT_READ)
  getRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.replenishmentService.getRule(id);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Replenishment kuralını güncelle' })
  @RequirePermission(Permissions.REPLENISHMENT_RULE_MANAGE)
  updateRule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateReplenishmentRuleDto,
  ) {
    return this.replenishmentService.updateRule(id, dto);
  }

  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Replenishment kuralını pasife al' })
  @RequirePermission(Permissions.REPLENISHMENT_RULE_MANAGE)
  deactivateRule(@Param('id', ParseUUIDPipe) id: string) {
    return this.replenishmentService.deactivateRule(id);
  }

  // ─── Suggestions ──────────────────────────────────────────────────────────

  @Get('suggestions')
  @ApiOperation({ summary: 'Replenishment önerilerini listele' })
  @RequirePermission(Permissions.REPLENISHMENT_READ)
  listSuggestions(@Query() query: ListReplenishmentSuggestionsDto) {
    return this.replenishmentService.listSuggestions(query);
  }

  @Get('suggestions/:id')
  @ApiOperation({ summary: 'Replenishment önerisini getir' })
  @RequirePermission(Permissions.REPLENISHMENT_READ)
  getSuggestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.replenishmentService.getSuggestion(id);
  }

  @Post('suggestions/:id/accept')
  @ApiOperation({ summary: 'Öneriyi onayla — Draft PO oluşturur' })
  @RequirePermission(Permissions.REPLENISHMENT_ACCEPT)
  acceptSuggestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.replenishmentService.acceptSuggestion(id);
  }

  @Post('suggestions/:id/dismiss')
  @ApiOperation({ summary: 'Öneriyi reddet' })
  @RequirePermission(Permissions.REPLENISHMENT_DISMISS)
  dismissSuggestion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DismissSuggestionDto,
  ) {
    return this.replenishmentService.dismissSuggestion(id, dto);
  }
}
