import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { HandoverController } from './handover.controller';
import { HandoverService } from './handover.service';
import { LlmNightLogExtractor } from '../night-log/llm-extractor';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      },
    }),
  ],
  controllers: [HandoverController],
  providers: [HandoverService, LlmNightLogExtractor],
  exports: [HandoverService],
})
export class HandoverModule {}
