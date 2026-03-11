import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { Permissions } from 'src/permission/constants/permissions.constants';
import { ApprovalService } from './approval.service';
import {
  CreateApprovalRequestDto,
  ListApprovalQueryDto,
  ReviewApprovalDto,
} from './dto/approval.dto';

@ApiTags('Approvals')
@ApiBearerAuth('access-token')
@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ApprovalController {
  constructor(private readonly approvalService: ApprovalService) {}

  @Post()
  @ApiOperation({ summary: 'Onay talebi oluştur (stok düzeltme veya fiyat override)' })
  @RequirePermission(Permissions.APPROVAL_REQUEST)
  create(@Body() dto: CreateApprovalRequestDto) {
    return this.approvalService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Onay taleplerini listele' })
  @RequirePermission(Permissions.APPROVAL_READ)
  list(@Query() query: ListApprovalQueryDto) {
    return this.approvalService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Onay talebi detayı' })
  @RequirePermission(Permissions.APPROVAL_READ)
  get(@Param('id') id: string) {
    return this.approvalService.get(id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Onay talebini geri çek (yalnızca talep sahibi)' })
  @RequirePermission(Permissions.APPROVAL_REQUEST)
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string) {
    return this.approvalService.cancel(id);
  }

  /** L1 onay/red — MANAGER yeterli */
  @Post(':id/review-l1')
  @ApiOperation({
    summary: 'L1 inceleme (onay veya red)',
    description: 'Tek seviyeli talepler (STOCK_ADJUSTMENT) burada tamamlanır. Çift seviyeli talepler L2\'ye geçer.',
  })
  @RequirePermission(Permissions.APPROVAL_REVIEW)
  @HttpCode(HttpStatus.OK)
  reviewL1(@Param('id') id: string, @Body() dto: ReviewApprovalDto) {
    return this.approvalService.reviewL1(id, dto);
  }

  /** L2 onay/red — yalnızca ADMIN/OWNER */
  @Post(':id/review-l2')
  @ApiOperation({
    summary: 'L2 inceleme (onay veya red) — yalnızca Admin/Owner',
    description: 'Çift seviyeli talepler (PRICE_OVERRIDE) burada tamamlanır ve işlem uygulanır.',
  })
  @RequirePermission(Permissions.APPROVAL_REVIEW_L2)
  @HttpCode(HttpStatus.OK)
  reviewL2(@Param('id') id: string, @Body() dto: ReviewApprovalDto) {
    return this.approvalService.reviewL2(id, dto);
  }
}
