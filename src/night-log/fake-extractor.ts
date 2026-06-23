import { Injectable } from '@nestjs/common';
import { ExtractNightLogInput, NightLogExtractor, ObservationDraft } from '../domain/types';

@Injectable()
export class FakeNightLogExtractor implements NightLogExtractor {
  private drafts: ObservationDraft[] = [];

  setDrafts(drafts: ObservationDraft[]): void {
    this.drafts = drafts;
  }

  async extract(_input: ExtractNightLogInput): Promise<ObservationDraft[]> {
    return this.drafts;
  }
}
