import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { validateStartupEnv } from './config/env';

async function bootstrap() {
  const env = validateStartupEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);

  for (const warning of env.warnings) {
    logger.warn({ phase: 'startup', warning });
  }

  app.useStaticAssets(join(__dirname, '..', 'public'), { prefix: '/ui' });
  const http = app.getHttpAdapter().getInstance();
  http.get('/', (_req: Request, res: Response) => {
    res.redirect('/ui/');
  });
  http.get('/ui', (_req: Request, res: Response) => {
    res.redirect('/ui/');
  });

  await app.listen(env.port, '0.0.0.0');
  logger.log({
    phase: 'startup',
    port: env.port,
    nodeEnv: env.nodeEnv,
    llmConfigured: env.llmConfigured,
  });
}

void bootstrap();
