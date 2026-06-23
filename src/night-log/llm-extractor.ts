import { Injectable } from '@nestjs/common';
import { newId } from '../common/id';
import { NightLogExtractionError } from '../errors/domain.errors';
import {
  ExtractNightLogInput,
  NightLogExtractor,
  ObservationDraft,
  PROMPT_VERSION,
} from '../domain/types';
import {
  EXTRACTION_SYSTEM_PROMPT,
  extractionResponseSchema,
  observationDraftSchema,
} from './extraction.schema';

@Injectable()
export class LlmNightLogExtractor implements NightLogExtractor {
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  private readonly baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

  getModelName(): string {
    return this.model;
  }

  getPromptVersion(): string {
    return PROMPT_VERSION;
  }

  async extract(input: ExtractNightLogInput): Promise<ObservationDraft[]> {
    if (!this.apiKey) {
      throw new NightLogExtractionError('OPENAI_API_KEY is not configured');
    }

    const userPrompt = `Hotel: ${input.hotelId}
Shift morning date: ${input.shiftDate}
Timezone: ${input.timezone}

Night log text:
"""
${input.nightLog}
"""

Return JSON: { "observations": [ { "occurredAt"?: string, "room"?: string, "category": string, "subjectKey": string, "issue": string, "signal": "opened"|"still_open"|"progress_update"|"resolved"|"unknown", "quote": string, "paragraphId"?: string, "ambiguities": string[] } ] }`;

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new NightLogExtractionError(
        `LLM extraction failed with status ${response.status}: ${body}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new NightLogExtractionError('LLM returned empty content');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw new NightLogExtractionError('LLM returned invalid JSON', error);
    }

    const validated = extractionResponseSchema.safeParse(parsed);
    if (!validated.success) {
      throw new NightLogExtractionError(
        `LLM output failed schema validation: ${validated.error.message}`,
      );
    }

    return validated.data.observations.map((obs) => {
      observationDraftSchema.parse(obs);
      return {
        occurredAt: obs.occurredAt,
        room: obs.room,
        category: obs.category,
        subjectKey: obs.subjectKey,
        issue: obs.issue,
        signal: obs.signal,
        evidence: [],
        ambiguities: obs.ambiguities,
        incidentRef: obs.incidentRef,
        quote: obs.quote,
        paragraphId: obs.paragraphId ?? newId(),
      } as ObservationDraft & { quote: string; paragraphId?: string };
    });
  }
}
