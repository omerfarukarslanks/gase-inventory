import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ValidationPipe } from '@nestjs/common';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  });

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

  // ---- Swagger config ----
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
      'access-token', // key ismi (opsiyonel ama kullanışlı)
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true, // sayfa refresh olunca token silinmesin
      jsonDocumentUrl: 'api-docs/json'
      
    },
  });
  // ---- Swagger bitti ----

  await app.listen(process.env.APP_PORT ?? process.env.PORT ?? 5000);
}
bootstrap();
