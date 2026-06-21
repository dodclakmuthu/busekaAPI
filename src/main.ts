import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

const productionAllowedHosts = new Set([
  'admin.buseka.lk',
  'buseka.lk',
  'www.buseka.lk',
  'dashboard.buseka.lk',
  'crew.buseka.lk'
]);

function isAllowedDevOrigin(origin: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    || /^https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(origin);
}

function isAllowedProductionOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && productionAllowedHosts.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function bootstrap() {
  loadEnv();
  const isProduction = process.env.NODE_ENV === 'production';
  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  const host = isProduction ? undefined : '0.0.0.0';

  const app = await NestFactory.create(AppModule);
  app.use((_: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman).
      if (!origin) {
        callback(null, true);
        return;
      }

      if (isProduction) {
        if (isAllowedProductionOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
        return;
      }

      // In local development, allow localhost and common LAN IP origins so Expo web/mobile
      // and browsers on the same Wi-Fi can access the API.
      if (isAllowedDevOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  if (host) {
    await app.listen(port, host);
  } else {
    await app.listen(port);
  }
}

void bootstrap();
