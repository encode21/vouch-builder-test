import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HandoverController } from './handover.controller';
import { HandoverService } from './handover.service';
import { LlmNightLogExtractor } from '../night-log/llm-extractor';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        redact: ['req.headers.authorization', 'OPENAI_API_KEY'],
      },
    }),
  ],
  controllers: [HandoverController],
  providers: [HandoverService, LlmNightLogExtractor],
  exports: [HandoverService],
})
export class HandoverModule {}
