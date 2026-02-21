import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth } from '@nestjs/swagger/dist/decorators/api-bearer.decorator';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt.auth.guard';
import { AiService } from './ai.service';
import { ChatRequestDto } from './dto/chat.dto';

@ApiTags('AI')
@ApiBearerAuth('access-token')
@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Ollama LLM ile chat (SSE stream)' })
  async chat(@Body() body: ChatRequestDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    let stream: NodeJS.ReadableStream;
    try {
      stream = await this.ai.chatWithToolsStream(body);
    } catch (err: any) {
      if (err instanceof HttpException) {
        throw err;
      }

      res.removeHeader('Content-Type');
      const status =
        err?.response?.status ??
        err?.status ??
        HttpStatus.SERVICE_UNAVAILABLE;
      const upstreamMessage =
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        err?.message ??
        'AI servisinde bir hata olustu.';

      throw new HttpException(
        {
          statusCode: status,
          message: upstreamMessage,
        },
        status,
      );
    }

    const fallbackContent =
      'Su anda uygun bir yanit olusturulamadi. Lutfen tekrar deneyin.';
    let accumulatedContent = '';
    let hasContent = false;
    let buffered = '';
    let finalSent = false;

    const emitMessage = (content: string) => {
      res.write(`event: message\ndata: ${JSON.stringify({ content })}\n\n`);
    };

    const emitFinal = (content: string) => {
      if (finalSent) {
        return;
      }
      finalSent = true;
      res.write(`event: final\ndata: ${JSON.stringify({ content })}\n\n`);
    };

    const processLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      try {
        const parsed = JSON.parse(trimmed);
        const token = parsed?.message?.content;

        if (typeof token === 'string' && token.length > 0) {
          accumulatedContent += token;
          hasContent = true;
          emitMessage(token);
        }

        if (parsed?.done === true) {
          if (!hasContent) {
            accumulatedContent = fallbackContent;
            hasContent = true;
            emitMessage(fallbackContent);
          }
          emitFinal(accumulatedContent);
        }
      } catch {
        // If upstream emits plain text, forward it as message content.
        accumulatedContent += trimmed;
        hasContent = true;
        emitMessage(trimmed);
      }
    };

    stream.on('data', (chunk: Buffer) => {
      buffered += chunk.toString('utf8');
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';

      for (const line of lines) {
        processLine(line);
      }
    });

    stream.on('end', () => {
      if (buffered.trim()) {
        processLine(buffered);
      }

      if (!hasContent) {
        accumulatedContent = fallbackContent;
        hasContent = true;
        emitMessage(fallbackContent);
      }

      emitFinal(accumulatedContent);
      res.write(`event: done\ndata: {}\n\n`);
      res.end();
    });

    stream.on('error', (err: any) => {
      if (!res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: err?.message ?? 'stream error' })}\n\n`,
        );
        res.end();
      }
    });

    res.on('close', () => {
      const destroy = (stream as any)?.destroy;
      if (typeof destroy === 'function') {
        destroy.call(stream);
      }
    });
  }

  @Post('chat/sync')
  @ApiOperation({ summary: 'Ollama LLM ile chat (tek seferde yanit)' })
  async chatSync(@Body() body: ChatRequestDto) {
    return this.ai.chatOnce(body);
  }
}
