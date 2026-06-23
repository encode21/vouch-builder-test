import { Injectable, Inject, Optional } from '@nestjs/common';
import { newId } from '../common/id';
import { PinoLogger } from 'nestjs-pino';
import { HandoverResult, NightLogExtractor, Observation } from '../domain/types';
import { NightLogExtractionError } from '../errors/domain.errors';
import { normalizeStructuredEvents } from '../events/event-normalizer';
import { assertAllItemsGrounded, buildHandover } from './handover.builder';
import { HandoverRequestDto } from './dto/handover-request.dto';
import { validateNightLogGrounding } from '../night-log/grounding.validator';
import { normalizeNightLogDrafts } from '../night-log/draft-normalizer';
import { detectResolutionDrafts } from '../night-log/resolution-detector';
import { LlmNightLogExtractor } from '../night-log/llm-extractor';
import { reconcileObservations } from '../reconciliation/reconciler';
import { assignShiftDate } from '../shift/shift-date.util';

export const NIGHT_LOG_EXTRACTOR = 'NIGHT_LOG_EXTRACTOR';

@Injectable()
export class HandoverService {
  constructor(
    private readonly logger: PinoLogger,
    @Optional()
    @Inject(NIGHT_LOG_EXTRACTOR)
    private readonly extractor?: NightLogExtractor,
    @Optional()
    private readonly llmExtractor?: LlmNightLogExtractor,
  ) {
    this.logger.setContext(HandoverService.name);
  }

  async generateHandover(request: HandoverRequestDto): Promise<HandoverResult> {
    const runId = newId();
    const extractor = this.extractor ?? this.llmExtractor;

    this.logger.info({
      runId,
      hotelId: request.hotelId,
      morningDate: request.morningDate,
      phase: 'request_accepted',
      eventCount: request.events.length,
      hasNightLog: Boolean(request.nightLog?.trim()),
    });

    const structuredObservations = normalizeStructuredEvents(
      request.events,
      request.hotelId,
      request.timezone,
    );

    this.logger.info({
      runId,
      hotelId: request.hotelId,
      morningDate: request.morningDate,
      phase: 'structured_normalization',
      observationCount: structuredObservations.length,
    });

    let nightLogObservations: Observation[] = [];
    const rejectedObservations: HandoverResult['rejectedObservations'] = [];
    let extractionFailed = false;

    if (request.nightLog?.trim()) {
      if (!extractor) {
        extractionFailed = true;
        this.logger.error({
          runId,
          phase: 'llm_extraction',
          decision: 'extractor_not_configured',
        });
      } else {
        try {
          const rawDrafts = await extractor.extract({
            hotelId: request.hotelId,
            shiftDate: request.morningDate,
            nightLog: request.nightLog,
            timezone: request.timezone,
          });

          const normalizedDrafts = normalizeNightLogDrafts(
            rawDrafts as Array<
              import('../domain/types').ObservationDraft & {
                quote?: string;
                paragraphId?: string;
              }
            >,
          );
          const supplementalDrafts = detectResolutionDrafts(request.nightLog, normalizedDrafts);
          const drafts = [...normalizedDrafts, ...supplementalDrafts];

          this.logger.info({
            runId,
            phase: 'llm_extraction',
            draftCount: drafts.length,
            supplementalDraftCount: supplementalDrafts.length,
            promptVersion: this.llmExtractor?.getPromptVersion(),
            model: this.llmExtractor?.getModelName(),
          });

          const grounding = validateNightLogGrounding(
            drafts as Array<
              import('../domain/types').ObservationDraft & {
                quote?: string;
                paragraphId?: string;
              }
            >,
            request.nightLog,
            { hotelId: request.hotelId, shiftDate: request.morningDate },
            () => newId(),
          );

          nightLogObservations = grounding.accepted;
          for (const rejected of grounding.rejected) {
            rejectedObservations.push({
              reason: rejected.reason,
              quote: rejected.draft.quote,
            });
          }

          this.logger.info({
            runId,
            phase: 'evidence_validation',
            acceptedCount: grounding.accepted.length,
            rejectedCount: grounding.rejected.length,
            warningCount: grounding.rejected.length,
          });
        } catch (error) {
          extractionFailed = true;
          const message =
            error instanceof NightLogExtractionError
              ? error.message
              : 'Night log extraction failed';
          this.logger.error({
            runId,
            phase: 'llm_extraction',
            decision: 'extraction_failed',
            error: message,
          });
        }
      }
    }

    const allObservations = [...structuredObservations, ...nightLogObservations].map((obs) => ({
      ...obs,
      shiftDate:
        obs.shiftDate || assignShiftDate(obs.occurredAt ?? request.morningDate, request.timezone),
    }));

    const { incidents, decisions } = reconcileObservations(allObservations);

    for (const decision of decisions) {
      this.logger.info({
        runId,
        phase: 'incident_reconciliation',
        observationId: decision.observationId,
        incidentId: decision.incidentId,
        decision: decision.decision,
        reasonCode: decision.decision,
        stateTransition: decision.stateTransition,
      });
    }

    const result = buildHandover({
      runId,
      hotelId: request.hotelId,
      morningDate: request.morningDate,
      timezone: request.timezone,
      incidents,
      rejectedObservations,
      extractionFailed,
    });

    assertAllItemsGrounded(result);

    this.logger.info({
      runId,
      hotelId: request.hotelId,
      morningDate: request.morningDate,
      phase: 'handover_completed',
      stillOpenCount: result.stillOpen.length,
      newTonightCount: result.newTonight.length,
      newlyResolvedCount: result.newlyResolved.length,
      warningCount: result.warnings.length,
    });

    return result;
  }
}
