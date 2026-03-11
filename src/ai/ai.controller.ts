import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { AiService } from './ai.service';
import { ActionAiService } from './action-ai.service';
import { ChatRequestDto } from './dto/chat.dto';
import { AnalyzeContextDto, ListAiSuggestionsQueryDto } from './dto/action-ai.dto';
import { RequirePermission } from 'src/common/decorators/require-permission.decorator';
import { PermissionGuard } from 'src/common/guards/permission.guard';
import { Permissions } from 'src/permission/constants/permissions.constants';

@ApiTags('AI')
@ApiBearerAuth('access-token')
@Controller('ai')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly actionAi: ActionAiService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Ollama LLM ile chat (SSE stream)' })
  @RequirePermission(Permissions.AI_CHAT)
  async chat(@Body() body: ChatRequestDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    let stream: NodeJS.ReadableStream;
    try {
      stream = await this.ai.chatWithToolsStream(body);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;

      res.removeHeader('Content-Type');
      const status =
        err?.response?.status ?? err?.status ?? HttpStatus.SERVICE_UNAVAILABLE;
      const upstreamMessage =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        err?.message ??
        'AI servisinde bir hata olustu.';

      throw new HttpException({ statusCode: status, message: upstreamMessage }, status);
    }

    const fallbackContent = 'Su anda uygun bir yanit olusturulamadi. Lutfen tekrar deneyin.';
    let accumulatedContent = '';
    let hasContent = false;
    let buffered = '';
    let finalSent = false;

    const emitMessage = (content: string) => {
      res.write(`event: message\ndata: ${JSON.stringify({ content })}\n\n`);
    };
    const emitFinal = (content: string) => {
      if (finalSent) return;
      finalSent = true;
      res.write(`event: final\ndata: ${JSON.stringify({ content })}\n\n`);
    };
    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const parsed = JSON.parse(trimmed);
        const token = parsed?.message?.content;
        if (typeof token === 'string' && token.length > 0) {
          accumulatedContent += token;
          hasContent = true;
          emitMessage(token);
        }
        if (parsed?.done === true) {
          if (!hasContent) { accumulatedContent = fallbackContent; hasContent = true; emitMessage(fallbackContent); }
          emitFinal(accumulatedContent);
        }
      } catch {
        accumulatedContent += trimmed;
        hasContent = true;
        emitMessage(trimmed);
      }
    };

    stream.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) processLine(line);
    });
    stream.on('end', () => {
      if (buffered.trim()) processLine(buffered);
      if (!hasContent) { accumulatedContent = fallbackContent; hasContent = true; emitMessage(fallbackContent); }
      emitFinal(accumulatedContent);
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
    });
    stream.on('error', (err: any) => {
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err?.message ?? 'stream error' })}\n\n`);
        res.end();
      }
    });
    res.on('close', () => {
      const destroy = (stream as any)?.destroy;
      if (typeof destroy === 'function') destroy.call(stream);
    });
  }

  @Post('chat/sync')
  @ApiOperation({ summary: 'Ollama LLM ile chat (tek seferde yanit)' })
  @RequirePermission(Permissions.AI_CHAT)
  async chatSync(@Body() body: ChatRequestDto) {
    return this.ai.chatOnce(body);
  }

  // ── Action AI ─────────────────────────────────────────────────────────────

  @Post('actions/analyze')
  @ApiOperation({
    summary: 'Mevcut verileri analiz et ve eylem önerileri üret',
    description: [
      'Düşük stok → CREATE_PO_DRAFT önerisi',
      'Ölü stok (60+ gündür satılmayan) → PRICE_ADJUSTMENT önerisi',
      'Öneri insan onayı olmadan uygulanmaz.',
    ].join('\n'),
  })
  @RequirePermission(Permissions.AI_CHAT)
  analyzeAndGenerate(@Body() dto: AnalyzeContextDto) {
    return this.actionAi.analyzeAndGenerate(dto);
  }

  @Get('actions/suggestions')
  @ApiOperation({ summary: 'AI eylem önerilerini listele' })
  @RequirePermission(Permissions.AI_CHAT)
  listSuggestions(@Query() query: ListAiSuggestionsQueryDto) {
    return this.actionAi.list(query);
  }

  @Get('actions/suggestions/:id')
  @ApiOperation({ summary: 'AI eylem önerisi detayı' })
  @RequirePermission(Permissions.AI_CHAT)
  getSuggestion(@Param('id') id: string) {
    return this.actionAi.get(id);
  }

  @Post('actions/suggestions/:id/confirm')
  @ApiOperation({
    summary: 'AI önerisini onayla (insan onayı zorunlu)',
    description: [
      'CREATE_PO_DRAFT → Draft PO oluşturulur.',
      'PRICE_ADJUSTMENT → ApprovalRequest (L2 çift seviye) açılır.',
      'STOCK_ADJUSTMENT → ApprovalRequest (L1 tek seviye) açılır.',
    ].join('\n'),
  })
  @RequirePermission(Permissions.AI_ACTION_CONFIRM)
  @HttpCode(HttpStatus.OK)
  confirmSuggestion(@Param('id') id: string) {
    return this.actionAi.confirm(id);
  }

  @Post('actions/suggestions/:id/dismiss')
  @ApiOperation({ summary: 'AI önerisini reddet' })
  @RequirePermission(Permissions.AI_CHAT)
  @HttpCode(HttpStatus.OK)
  dismissSuggestion(@Param('id') id: string) {
    return this.actionAi.dismiss(id);
  }
}
