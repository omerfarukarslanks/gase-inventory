import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── HTTP Güvenlik Başlıkları ───────────────────────────────────────────────
  app.use(helmet());

  // ── CORS ──────────────────────────────────────────────────────────────────
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? process.env.APP_WEB_URL ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Same-origin veya server-to-server (origin yok)
      if (!origin) return callback(null, true);
      if (!allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: '${origin}' origin'ine izin verilmiyor.`));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

  // ── Validation ────────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const dataSource = app.get(DataSource);
  if (process.env.NODE_ENV !== 'production') {
    await dataSource.runMigrations();
  }

  // ── Swagger (yalnızca production dışında) ─────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Barcode & Inventory API')
      .setDescription('Multi-tenant stok, satış ve ürün yönetimi için API dokümantasyonu')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'Authorization',
          in: 'header',
        },
        'access-token',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        jsonDocumentUrl: 'api-docs/json',
      },
    });
  }

  await app.listen(process.env.APP_PORT ?? process.env.PORT ?? 5000);
}
bootstrap();
