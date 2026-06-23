export type ObservationSignal =
  | 'opened'
  | 'still_open'
  | 'progress_update'
  | 'resolved'
  | 'unknown';

export type Evidence =
  | {
      sourceType: 'event';
      eventId: string;
    }
  | {
      sourceType: 'night_log';
      paragraphId: string;
      quote: string;
      lineStart?: number;
      lineEnd?: number;
    };

export type Observation = {
  observationId: string;
  hotelId: string;
  shiftDate: string;
  occurredAt?: string;
  room?: string;
  category: string;
  subjectKey: string;
  issue: string;
  signal: ObservationSignal;
  evidence: Evidence[];
  ambiguities: string[];
  incidentRef?: string;
  rejected?: boolean;
  rejectionReason?: string;
};

export type IncidentStatus = 'open' | 'resolved' | 'unknown';

export type Incident = {
  incidentId: string;
  hotelId: string;
  room?: string;
  category: string;
  subjectKey: string;
  title: string;
  status: IncidentStatus;
  openedAt: string;
  resolvedAt?: string;
  lastUpdatedAt: string;
  observations: Observation[];
  warnings: string[];
  reopened?: boolean;
  openedOnShiftDate?: string;
  resolvedOnShiftDate?: string;
};

export type HandoverPriority = 'critical' | 'high' | 'medium' | 'low';

export type HandoverItem = {
  incidentId: string;
  title: string;
  status: IncidentStatus;
  priority: HandoverPriority;
  openedDate: string;
  latestUpdate: string;
  recommendedAction: string;
  warnings: string[];
  evidence: Evidence[];
  section: 'stillOpen' | 'newTonight' | 'newlyResolved' | 'warnings';
};

export type HandoverResult = {
  runId: string;
  hotelId: string;
  morningDate: string;
  timezone: string;
  generatedAt: string;
  stillOpen: HandoverItem[];
  newlyResolved: HandoverItem[];
  newTonight: HandoverItem[];
  warnings: HandoverItem[];
  rejectedObservations: Array<{
    observationId?: string;
    reason: string;
    quote?: string;
  }>;
  extractionFailed?: boolean;
  renderedText: string;
};

export type StructuredEvent = {
  id: string;
  timestamp: string;
  type: string;
  room: string | null;
  guest: string | null;
  description: string;
  status: string;
};

export type ObservationDraft = Omit<Observation, 'observationId' | 'hotelId' | 'shiftDate'> & {
  paragraphId?: string;
};

export type ExtractNightLogInput = {
  hotelId: string;
  shiftDate: string;
  nightLog: string;
  timezone: string;
};

export interface NightLogExtractor {
  extract(input: ExtractNightLogInput): Promise<ObservationDraft[]>;
}

export const PROMPT_VERSION = 'night-log-v1';
