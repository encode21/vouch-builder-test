import {
  Evidence,
  HandoverItem,
  HandoverPriority,
  HandoverResult,
  Incident,
} from '../domain/types';
import { UngroundedHandoverItemError } from '../errors/domain.errors';

const PRIORITY_ORDER: Record<HandoverPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function classifyPriority(incident: Incident): HandoverPriority {
  const issue = incident.observations[incident.observations.length - 1]?.issue.toLowerCase() ?? '';
  if (
    incident.category === 'guest_welfare' ||
    issue.includes('passport') ||
    issue.includes('safe') ||
    issue.includes('保险箱')
  ) {
    return 'critical';
  }
  if (
    incident.category === 'compliance' ||
    incident.category === 'damage' ||
    issue.includes('leak') ||
    issue.includes('out of order')
  ) {
    return 'high';
  }
  if (incident.category === 'finance' || incident.category === 'front_desk') {
    return 'medium';
  }
  return 'low';
}

const ACTION_PATTERNS: RegExp[] = [
  /please chase this first thing[^.]*\./i,
  /someone should reconcile[^.]*\./i,
  /要尽快[^。]*[。.]?/,
  /不然他走不了[。.]?/,
  /passing it on again[^.]*\./i,
  /still not fixed[^.]*\./i,
  /NOT yet charged[^.]*\./i,
  /morning team to [^.]*\./i,
  /flagging in case[^.]*\./i,
];

function textSourcesForAction(incident: Incident): string[] {
  const texts: string[] = [];
  for (const observation of incident.observations) {
    texts.push(observation.issue);
    for (const ev of observation.evidence) {
      if (ev.sourceType === 'night_log') {
        texts.push(ev.quote);
      }
    }
  }
  return texts;
}

function conservativeAction(incident: Incident): string {
  const latest = incident.observations[incident.observations.length - 1];
  const issue = latest?.issue.toLowerCase() ?? '';

  if (
    incident.warnings.some(
      (w) =>
        w.includes('ambiguous') ||
        w.includes('contradict') ||
        w.includes('billing_system_mismatch') ||
        w.includes('room_unknown'),
    )
  ) {
    return 'Confirm status from the source entry.';
  }

  if (incident.status === 'resolved') {
    return 'No morning follow-up required unless new information emerges.';
  }

  for (const text of textSourcesForAction(incident)) {
    for (const pattern of ACTION_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        return match[0].trim();
      }
    }
  }

  if (issue.includes('safe') || issue.includes('保险箱')) {
    return 'Arrange safe engineer or locksmith before guest checkout.';
  }

  if (issue.includes('morning team') || issue.includes('flag to')) {
    const sentence = latest.issue.split('.').find((s) => /morning|flag to/i.test(s));
    if (sentence) {
      return sentence.trim();
    }
  }

  return 'Morning manager follow-up required.';
}

function collectEvidence(incident: Incident): Evidence[] {
  const evidence: Evidence[] = [];
  for (const obs of incident.observations) {
    evidence.push(...obs.evidence);
  }
  return evidence;
}

function latestUpdateText(incident: Incident): string {
  const latest = incident.observations[incident.observations.length - 1];
  return latest?.issue ?? incident.title;
}

function classifyIncident(
  incident: Incident,
  morningDate: string,
): 'stillOpen' | 'newTonight' | 'newlyResolved' | null {
  const openedOnTarget = incident.openedOnShiftDate === morningDate;
  const resolvedOnTarget = incident.resolvedOnShiftDate === morningDate;
  const openedBeforeTarget =
    incident.openedOnShiftDate !== undefined && incident.openedOnShiftDate < morningDate;

  if (incident.status === 'resolved' && resolvedOnTarget && openedBeforeTarget) {
    return 'newlyResolved';
  }

  if (incident.status === 'open' && openedOnTarget) {
    return 'newTonight';
  }

  if (incident.status === 'open' && openedBeforeTarget) {
    return 'stillOpen';
  }

  if (incident.status === 'open' && !openedOnTarget && !openedBeforeTarget) {
    return 'stillOpen';
  }

  return null;
}

function toHandoverItem(incident: Incident, section: HandoverItem['section']): HandoverItem {
  const evidence = collectEvidence(incident);
  if (evidence.length === 0) {
    throw new UngroundedHandoverItemError(incident.incidentId);
  }

  return {
    incidentId: incident.incidentId,
    title: incident.title,
    status: incident.status,
    priority: classifyPriority(incident),
    openedDate: incident.openedAt.slice(0, 10),
    latestUpdate: latestUpdateText(incident),
    recommendedAction: conservativeAction(incident),
    warnings: [...new Set(incident.warnings)],
    evidence,
    section,
  };
}

function sortItems(items: HandoverItem[]): HandoverItem[] {
  return [...items].sort((a, b) => {
    const p = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (p !== 0) return p;
    return a.openedDate.localeCompare(b.openedDate);
  });
}

function renderMarkdown(result: Omit<HandoverResult, 'renderedText'>): string {
  const sections: Array<{ title: string; items: HandoverItem[] }> = [
    { title: 'Still open (carried over)', items: result.stillOpen },
    { title: 'New tonight', items: result.newTonight },
    { title: 'Newly resolved overnight', items: result.newlyResolved },
    { title: 'Warnings / needs confirmation', items: result.warnings },
  ];

  const lines: string[] = [
    `# Night-shift handover — ${result.hotelId}`,
    `Morning date: ${result.morningDate} (${result.timezone})`,
    '',
  ];

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    if (section.items.length === 0) {
      lines.push('_None_');
      lines.push('');
      continue;
    }
    for (const item of section.items) {
      lines.push(`### ${item.title}`);
      lines.push(`- Status: ${item.status}`);
      lines.push(`- Priority: ${item.priority}`);
      lines.push(`- Opened: ${item.openedDate}`);
      lines.push(`- Latest: ${item.latestUpdate}`);
      lines.push(`- Action: ${item.recommendedAction}`);
      if (item.warnings.length > 0) {
        lines.push(`- Warnings: ${item.warnings.join('; ')}`);
      }
      lines.push(`- Evidence refs: ${item.evidence.length}`);
      lines.push('');
    }
  }

  if (result.rejectedObservations.length > 0) {
    lines.push('## Rejected ungrounded extractions');
    for (const r of result.rejectedObservations) {
      lines.push(`- ${r.reason}${r.quote ? `: "${r.quote.slice(0, 80)}..."` : ''}`);
    }
  }

  if (result.extractionFailed) {
    lines.push('');
    lines.push(
      '_Note: free-text night-log extraction failed; handover reflects structured events only._',
    );
  }

  return lines.join('\n');
}

export function buildHandover(params: {
  runId: string;
  hotelId: string;
  morningDate: string;
  timezone: string;
  incidents: Incident[];
  rejectedObservations: HandoverResult['rejectedObservations'];
  extractionFailed?: boolean;
}): HandoverResult {
  const stillOpen: HandoverItem[] = [];
  const newTonight: HandoverItem[] = [];
  const newlyResolved: HandoverItem[] = [];
  const warnings: HandoverItem[] = [];

  for (const incident of params.incidents) {
    const section = classifyIncident(incident, params.morningDate);
    if (!section) {
      continue;
    }

    const item = toHandoverItem(incident, section);
    if (section === 'stillOpen') stillOpen.push(item);
    else if (section === 'newTonight') newTonight.push(item);
    else if (section === 'newlyResolved') newlyResolved.push(item);
  }

  for (const incident of params.incidents) {
    if (incident.warnings.some((w) => w.startsWith('observation_ambiguity:'))) {
      const warningItem = toHandoverItem(incident, 'warnings');
      if (!warnings.find((w) => w.incidentId === warningItem.incidentId)) {
        warnings.push(warningItem);
      }
    }
  }

  const warningIds = new Set(warnings.map((w) => w.incidentId));
  const filterExclusive = (items: HandoverItem[]) =>
    items.filter((item) => !warningIds.has(item.incidentId));

  const base: Omit<HandoverResult, 'renderedText'> = {
    runId: params.runId,
    hotelId: params.hotelId,
    morningDate: params.morningDate,
    timezone: params.timezone,
    generatedAt: new Date().toISOString(),
    stillOpen: sortItems(filterExclusive(stillOpen)),
    newTonight: sortItems(filterExclusive(newTonight)),
    newlyResolved: sortItems(filterExclusive(newlyResolved)),
    warnings: sortItems(warnings),
    rejectedObservations: params.rejectedObservations,
    extractionFailed: params.extractionFailed,
  };

  return {
    ...base,
    renderedText: renderMarkdown(base),
  };
}

export function assertAllItemsGrounded(result: HandoverResult): void {
  const all = [
    ...result.stillOpen,
    ...result.newTonight,
    ...result.newlyResolved,
    ...result.warnings,
  ];
  for (const item of all) {
    if (item.evidence.length === 0) {
      throw new UngroundedHandoverItemError(item.incidentId);
    }
  }
}
