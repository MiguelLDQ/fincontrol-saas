import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser = require('cookie-parser');
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cookieParser());

  app.enableCors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(new ValidationPipe({
    whitelist: false,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // Serve o frontend da pasta public na raiz do projeto
  app.useStaticAssets(join(process.cwd(), 'public'));

  app.setGlobalPrefix('api/v1', { exclude: ['/'] });

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`\n🚀 API:      http://localhost:${port}/api/v1`);
  console.log(`🌐 Frontend: http://localhost:${port}\n`);
}

bootstrap();