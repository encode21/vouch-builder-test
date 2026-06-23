/** @typedef {{ sourceType: string; eventId?: string; paragraphId?: string; quote?: string; lineStart?: number; lineEnd?: number }} Evidence */
/** @typedef {{ incidentId: string; title: string; status: string; priority: string; openedDate: string; latestUpdate: string; recommendedAction: string; warnings: string[]; evidence: Evidence[] }} HandoverItem */
/** @typedef {{ runId: string; hotelId: string; morningDate: string; timezone: string; generatedAt: string; stillOpen: HandoverItem[]; newTonight: HandoverItem[]; newlyResolved: HandoverItem[]; warnings: HandoverItem[]; rejectedObservations: Array<{ observationId?: string; reason: string; quote?: string }>; extractionFailed?: boolean; renderedText: string }} HandoverResult */

const SAMPLE_URL = '/ui/sample-request.json';

const DEFAULTS = {
  hotelId: 'lumen-sg',
  timezone: '+08:00',
  morningDate: '2026-05-30',
  events: '[]',
  nightLog: '',
};

/** @type {HandoverResult | null} */
let lastResponse = null;

const form = document.getElementById('handover-form');
const hotelIdInput = /** @type {HTMLInputElement} */ (document.getElementById('hotelId'));
const morningDateInput = /** @type {HTMLInputElement} */ (document.getElementById('morningDate'));
const timezoneInput = /** @type {HTMLInputElement} */ (document.getElementById('timezone'));
const eventsInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('events'));
const nightLogInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('nightLog'));
const submitBtn = /** @type {HTMLButtonElement} */ (document.getElementById('submit-btn'));
const loadSampleBtn = /** @type {HTMLButtonElement} */ (document.getElementById('load-sample-btn'));
const resetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('reset-btn'));
const loadingBanner = document.getElementById('loading-banner');
const errorBanner = document.getElementById('error-banner');
const resultsSection = document.getElementById('results');
const metaBar = document.getElementById('meta-bar');
const sectionsRoot = document.getElementById('sections-root');
const renderedTextEl = document.getElementById('rendered-text');
const rawJsonEl = document.getElementById('raw-json');
const copyJsonBtn = /** @type {HTMLButtonElement} */ (document.getElementById('copy-json-btn'));
const copyFeedback = document.getElementById('copy-feedback');

/** @type {boolean} */
let isSubmitting = false;

function applyDefaults() {
  hotelIdInput.value = DEFAULTS.hotelId;
  morningDateInput.value = DEFAULTS.morningDate;
  timezoneInput.value = DEFAULTS.timezone;
  eventsInput.value = DEFAULTS.events;
  nightLogInput.value = DEFAULTS.nightLog;
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.textContent = '';
  errorBanner.hidden = true;
}

function setLoading(active) {
  loadingBanner.hidden = !active;
  submitBtn.disabled = active;
  loadSampleBtn.disabled = active;
  resetBtn.disabled = active;
  submitBtn.textContent = active ? 'Generating…' : 'Generate handover';
}

/**
 * @param {string} value
 * @returns {{ ok: true; data: unknown } | { ok: false; message: string }}
 */
function parseEventsJson(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: false, message: 'Events JSON is required.' };
  }
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) {
      return { ok: false, message: 'Events JSON must be an array.' };
    }
    return { ok: true, data: parsed };
  } catch {
    return { ok: false, message: 'Events JSON is invalid. Fix syntax before submitting.' };
  }
}

/**
 * @returns {{ ok: true; payload: Record<string, unknown> } | { ok: false; message: string }}
 */
function buildPayload() {
  const hotelId = hotelIdInput.value.trim();
  const morningDate = morningDateInput.value.trim();
  const timezone = timezoneInput.value.trim();

  if (!hotelId) {
    return { ok: false, message: 'Hotel ID is required.' };
  }
  if (!morningDate) {
    return { ok: false, message: 'Morning date is required.' };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(morningDate)) {
    return { ok: false, message: 'Morning date must be YYYY-MM-DD.' };
  }
  if (!timezone) {
    return { ok: false, message: 'Timezone is required.' };
  }

  const eventsResult = parseEventsJson(eventsInput.value);
  if (!eventsResult.ok) {
    return eventsResult;
  }

  /** @type {Record<string, unknown>} */
  const payload = {
    hotelId,
    timezone,
    morningDate,
    events: eventsResult.data,
  };

  const nightLog = nightLogInput.value.trim();
  if (nightLog) {
    payload.nightLog = nightLog;
  }

  return { ok: true, payload };
}

/**
 * @param {string} text
 * @returns {string}
 */
function formatApiError(text) {
  try {
    const body = JSON.parse(text);
    if (typeof body.message === 'string') {
      if (body.errors) {
        return `${body.message}: ${JSON.stringify(body.errors)}`;
      }
      return body.message;
    }
    return JSON.stringify(body, null, 2);
  } catch {
    return text || 'Request failed.';
  }
}

/**
 * @param {string} tag
 * @param {string} [className]
 * @returns {HTMLElement}
 */
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/**
 * @param {HTMLElement} parent
 * @param {string} label
 * @param {string} value
 */
function appendField(parent, label, value) {
  const row = el('div', 'item-field');
  const dt = el('dt');
  dt.textContent = `${label}:`;
  const dd = el('dd');
  dd.textContent = value;
  row.appendChild(dt);
  row.appendChild(dd);
  parent.appendChild(row);
}

/**
 * @param {Evidence} evidence
 * @returns {HTMLElement}
 */
function renderEvidenceItem(evidence) {
  const item = el('div', 'evidence-item');
  const meta = el('div', 'evidence-meta');

  const parts = [`Source: ${evidence.sourceType}`];
  if (evidence.eventId) parts.push(`Event ID: ${evidence.eventId}`);
  if (evidence.paragraphId) parts.push(`Paragraph: ${evidence.paragraphId}`);
  if (evidence.lineStart !== undefined) {
    const end = evidence.lineEnd !== undefined ? evidence.lineEnd : evidence.lineStart;
    parts.push(`Lines: ${evidence.lineStart}–${end}`);
  }
  meta.textContent = parts.join(' · ');
  item.appendChild(meta);

  if (evidence.quote) {
    const quote = el('p', 'evidence-quote');
    quote.textContent = evidence.quote;
    item.appendChild(quote);
  }

  return item;
}

/**
 * @param {HandoverItem} item
 * @returns {HTMLElement}
 */
function renderHandoverItem(item) {
  const card = el('article', 'item-card');
  if (item.warnings && item.warnings.length > 0) {
    card.classList.add('has-warnings');
  }

  const header = el('div', 'item-header');
  const title = el('div', 'item-title');
  title.textContent = item.title;
  header.appendChild(title);

  const priorityBadge = el('span', `badge badge-${item.priority}`);
  priorityBadge.textContent = item.priority;
  header.appendChild(priorityBadge);

  const statusBadge = el('span', 'badge badge-status');
  statusBadge.textContent = item.status;
  header.appendChild(statusBadge);

  card.appendChild(header);

  appendField(card, 'Opened', item.openedDate);
  appendField(card, 'Latest update', item.latestUpdate);
  appendField(card, 'Recommended action', item.recommendedAction);

  if (item.warnings && item.warnings.length > 0) {
    const warnList = el('ul', 'warnings-list');
    for (const warning of item.warnings) {
      const li = el('li');
      li.textContent = warning;
      warnList.appendChild(li);
    }
    card.appendChild(warnList);
  }

  if (item.evidence && item.evidence.length > 0) {
    const details = el('details', 'evidence');
    const summary = el('summary');
    summary.textContent = `Evidence (${item.evidence.length})`;
    details.appendChild(summary);
    for (const ev of item.evidence) {
      details.appendChild(renderEvidenceItem(ev));
    }
    card.appendChild(details);
  }

  return card;
}

/**
 * @param {string} title
 * @param {HandoverItem[]} items
 * @returns {HTMLElement}
 */
function renderSection(title, items) {
  const section = el('div', 'section-card');
  const heading = el('h3');
  heading.textContent = title;
  section.appendChild(heading);

  if (!items || items.length === 0) {
    const empty = el('p', 'section-empty');
    empty.textContent = 'None';
    section.appendChild(empty);
    return section;
  }

  for (const item of items) {
    section.appendChild(renderHandoverItem(item));
  }
  return section;
}

/**
 * @param {HandoverResult['rejectedObservations']} rejected
 * @returns {HTMLElement}
 */
function renderRejectedSection(rejected) {
  const section = el('div', 'section-card');
  const heading = el('h3');
  heading.textContent = 'Incomplete or contradictory entries';
  section.appendChild(heading);

  const warningItems = lastResponse?.warnings ?? [];
  const hasWarnings = warningItems.length > 0;
  const hasRejected = rejected && rejected.length > 0;

  if (!hasWarnings && !hasRejected) {
    const empty = el('p', 'section-empty');
    empty.textContent = 'None';
    section.appendChild(empty);
    return section;
  }

  if (hasWarnings) {
    const sub = el('h4');
    sub.textContent = 'Requires confirmation';
    sub.style.fontSize = '0.9rem';
    sub.style.margin = '0 0 0.5rem';
    section.appendChild(sub);
    for (const item of warningItems) {
      section.appendChild(renderHandoverItem(item));
    }
  }

  if (hasRejected) {
    const sub = el('h4');
    sub.textContent = 'Rejected / ungrounded extractions';
    sub.style.fontSize = '0.9rem';
    sub.style.margin = hasWarnings ? '0.75rem 0 0.5rem' : '0 0 0.5rem';
    section.appendChild(sub);
    for (const r of rejected) {
      const block = el('div', 'rejected-item');
      let text = r.reason;
      if (r.observationId) text += ` (observation ${r.observationId})`;
      block.textContent = text;
      if (r.quote) {
        const quote = el('p', 'evidence-quote');
        quote.textContent = r.quote;
        block.appendChild(quote);
      }
      section.appendChild(block);
    }
  }

  if (lastResponse?.extractionFailed) {
    const note = el('p', 'section-empty');
    note.textContent =
      'Free-text night-log extraction failed; handover reflects structured events only.';
    note.style.marginTop = '0.5rem';
    section.appendChild(note);
  }

  return section;
}

/**
 * @param {HandoverResult} result
 */
function renderResults(result) {
  lastResponse = result;
  sectionsRoot.replaceChildren();

  sectionsRoot.appendChild(renderSection('Still open / Requires attention', result.stillOpen));
  sectionsRoot.appendChild(renderSection('New tonight', result.newTonight));
  sectionsRoot.appendChild(renderSection('Newly resolved', result.newlyResolved));
  sectionsRoot.appendChild(renderRejectedSection(result.rejectedObservations));

  metaBar.textContent = `Run ${result.runId} · ${result.hotelId} · morning ${result.morningDate} (${result.timezone}) · generated ${result.generatedAt}`;

  renderedTextEl.textContent = result.renderedText ?? '';
  rawJsonEl.textContent = JSON.stringify(result, null, 2);

  copyFeedback.hidden = true;
  resultsSection.hidden = false;
}

async function loadSampleData() {
  clearError();
  try {
    const response = await fetch(SAMPLE_URL);
    if (!response.ok) {
      throw new Error(`Could not load sample data (HTTP ${response.status}).`);
    }
    const sample = await response.json();
    hotelIdInput.value = sample.hotelId ?? DEFAULTS.hotelId;
    timezoneInput.value = sample.timezone ?? DEFAULTS.timezone;
    morningDateInput.value = sample.morningDate ?? DEFAULTS.morningDate;
    eventsInput.value = JSON.stringify(sample.events ?? [], null, 2);
    nightLogInput.value = sample.nightLog ?? '';
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  }
}

function resetForm() {
  clearError();
  applyDefaults();
  resultsSection.hidden = true;
  lastResponse = null;
  sectionsRoot.replaceChildren();
  renderedTextEl.textContent = '';
  rawJsonEl.textContent = '';
  copyFeedback.hidden = true;
}

async function submitHandover(event) {
  event.preventDefault();
  if (isSubmitting) return;

  clearError();
  resultsSection.hidden = true;

  const payloadResult = buildPayload();
  if (!payloadResult.ok) {
    showError(payloadResult.message);
    return;
  }

  isSubmitting = true;
  setLoading(true);

  try {
    const response = await fetch('/handover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadResult.payload),
    });

    const text = await response.text();
    if (!response.ok) {
      showError(`HTTP ${response.status}: ${formatApiError(text)}`);
      return;
    }

    let body;
    try {
      body = JSON.parse(text);
    } catch {
      showError('Server returned a non-JSON response.');
      return;
    }

    renderResults(body);
  } catch (err) {
    showError(
      err instanceof Error
        ? `Request could not be completed: ${err.message}`
        : 'Request could not be completed.',
    );
  } finally {
    isSubmitting = false;
    setLoading(false);
  }
}

async function copyRawJson() {
  if (!lastResponse) return;
  const text = JSON.stringify(lastResponse, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    copyFeedback.hidden = false;
    window.setTimeout(() => {
      copyFeedback.hidden = true;
    }, 2000);
  } catch {
    showError('Could not copy to clipboard. Select the JSON manually.');
  }
}

form.addEventListener('submit', submitHandover);
loadSampleBtn.addEventListener('click', loadSampleData);
resetBtn.addEventListener('click', resetForm);
copyJsonBtn.addEventListener('click', copyRawJson);

applyDefaults();
