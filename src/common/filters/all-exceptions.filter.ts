import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { AppClsStore } from '../context/cls-store.type';

interface ErrorResponseBody {
  success: false;
  statusCode: number;
  correlationId: string | null;
  timestamp: string;
  path: string;
  method: string;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly cls: ClsService<AppClsStore>,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const correlationId = this.cls.get('correlationId') ?? null;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'Beklenmeyen bir hata oluştu. Lütfen daha sonra tekrar deneyin.';
    let details: any = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      // HttpException içinde gönderdiğimiz payload'ı okuyalım
      if (typeof response === 'string') {
        // throw new BadRequestException('Mesaj')
        message = response;
        code = HttpStatus[status] ?? `HTTP_${status}`;
      } else if (typeof response === 'object' && response) {
        const r: any = response;

        // Domain error'larımız: { code, message, details? }
        if (r.code) {
          code = r.code;
        } else if (r.error) {
          // Nest default: { statusCode, message, error }
          code = r.error;
        } else {
          code = HttpStatus[status] ?? `HTTP_${status}`;
        }

        if (r.message) {
          if (Array.isArray(r.message)) {
            // class-validator mesajları genelde array
            message = r.message.join(' ');
            details = { validationErrors: r.message };
          } else {
            message = r.message;
          }
        }

        if (r.details) {
          details = r.details;
        }
      }
    } else {
      // HttpException değilse (ör: TypeError vs.)
      // Burada log’ları daha detaylı alabilirsin.
      // message/stack’i log’a yazıp, kullanıcıya generic mesaj döneriz.
      code = (exception as any).code || 'INTERNAL_SERVER_ERROR';
      // message'ı kullanıcıya çok teknik göstermemek için generic bırakıyoruz.
    }

    const body: ErrorResponseBody = {
      success: false,
      statusCode: status,
      correlationId,
      timestamp: new Date().toISOString(),
      path: req.url,
      method: req.method,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    };

    res.status(status).json(body);
  }
}
