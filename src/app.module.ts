import { Module } from '@nestjs/common';
import { HandoverModule } from './handover/handover.module';

@Module({
  imports: [HandoverModule],
})
export class AppModule {}
