export class UngroundedHandoverItemError extends Error {
  constructor(public readonly incidentId: string) {
    super(`Handover item ${incidentId} has no evidence references`);
    this.name = 'UngroundedHandoverItemError';
  }
}

export class HandoverValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HandoverValidationError';
  }
}

export class NightLogExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'NightLogExtractionError';
  }
}
