import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { SyncService } from './sync.service';
import { SyncPushService } from './sync-push.service';
import { GetChangesQueryDto } from './dto/sync.dto';
import { SyncPushDto } from './dto/sync-push.dto';

@ApiTags('Sync')
@ApiBearerAuth('access-token')
@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(
    private readonly syncService: SyncService,
    private readonly syncPushService: SyncPushService,
  ) {}

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

  /**
   * Client → Sunucu push.
   * Birden fazla operasyonu tek istekte gönderir (batch, maks. 50).
   *
   * Her operasyon bağımsız değerlendirilir:
   * - `accepted`  → sunucu işledi
   * - `conflict`  → sunucu daha yeni veriye sahip; `serverVersion` ile reconcile et
   * - `rejected`  → validasyon veya iş kuralı hatası; `reason` alanına bak
   *
   * Idempotency-Key header'ı ile aynı batch tekrar gönderilebilir.
   */
  @Post('push')
  @ApiOperation({
    summary: 'Client operasyonlarını sunucuya push et (batch)',
    description: [
      'Her operasyon `operationId` (client UUID) ile takip edilir.',
      'Sonuç listesindeki sıra, istek listesindeki sırayla birebir eşleşir.',
      'Tüm batch başarısız olsa dahi HTTP 200 döner; durum `results[].status` ile anlaşılır.',
    ].join('\n'),
  })
  push(@Body() dto: SyncPushDto) {
    return this.syncPushService.push(dto);
  }
}
