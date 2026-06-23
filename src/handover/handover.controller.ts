import {
  BadRequestException,
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { HandoverValidationError, UngroundedHandoverItemError } from '../errors/domain.errors';
import { handoverRequestSchema } from './dto/handover-request.dto';
import { HandoverService } from './handover.service';

@Controller()
export class HandoverController {
  constructor(
    private readonly handoverService: HandoverService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HandoverController.name);
  }

  @Get('health')
  health(): { status: string; service: string } {
    return { status: 'ok', service: 'night-shift-handover' };
  }

  @Post('handover')
  async handover(@Body() body: unknown) {
    const parsed = handoverRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid handover request',
        errors: parsed.error.flatten(),
      });
    }

    try {
      return await this.handoverService.generateHandover(parsed.data);
    } catch (error) {
      if (error instanceof HandoverValidationError || error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof UngroundedHandoverItemError) {
        this.logger.error({ phase: 'handover_failed', reason: error.message });
        throw new InternalServerErrorException(error.message);
      }
      const message = error instanceof Error ? error.message : 'Handover generation failed';
      this.logger.error({ phase: 'handover_failed', error: message });
      throw new InternalServerErrorException(message);
    }
  }
}
