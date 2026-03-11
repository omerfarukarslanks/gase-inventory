import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { SyncService } from './sync.service';
import { GetChangesQueryDto } from './dto/sync.dto';

@ApiTags('Sync')
@ApiBearerAuth('access-token')
@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * Cursor tabanlı event akışı.
   * Client `since` cursor'ını sakladığı sürece hiçbir değişikliği kaçırmaz.
   *
   * Yanıttaki `nextCursor` bir sonraki istekte `since` olarak kullanılmalıdır.
   * `hasMore: true` ise aynı cursor ile tekrar istek at.
   */
  @Get('changes')
  @ApiOperation({
    summary: 'Outbox event akışından değişiklikleri çek (cursor tabanlı)',
    description: [
      '`since` belirtilmezse son 7 günün event\'leri döner.',
      '`nextCursor` bir sonraki istekte `since` olarak kullanılır.',
      '`hasMore: true` ise pagination devam ediyor demektir — aynı cursor ile tekrar çek.',
    ].join('\n'),
  })
  getChanges(@Query() query: GetChangesQueryDto) {
    return this.syncService.getChanges(query);
  }
}
