import {
  collectPageFields,
  controlFingerprint,
  findControlByFingerprint,
  fingerprintOccurrence,
  type CollectedControlKind,
} from '../page-mapping/collector';
import { pageSignatureOf } from '../page-mapping/rules';
import {
  fillControl,
  isUnsafeControl,
  readControlValue,
  type FillInstruction,
  type FillOutcome,
} from './adapters';

const HIGHLIGHT = 'offerNailFill';

export interface FillSession {
  pageSignature: string;
  outcomes: FillOutcome[];
}

export function highlightControl(
  element: Element,
  status: FillOutcome['status'],
): void {
  (element as HTMLElement).dataset[HIGHLIGHT] = status;
}

export function clearHighlight(element: Element): void {
  delete (element as HTMLElement).dataset[HIGHLIGHT];
}

export function addRepeatBlocks(
  root: Document,
  count: number,
  buttonName = '添加工作经历',
): number {
  if (count <= 0) return 0;
  const button = Array.from(root.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === buttonName,
  );
  if (!button) return 0;
  for (let index = 0; index < count; index += 1) button.click();
  return count;
}

export function applyFill(
  root: Document,
  instructions: FillInstruction[],
  options: {
    addEmploymentCount?: number;
    newEmployments?: Array<{ company: string; position: string }>;
  } = {},
): FillSession {
  ensureHighlightStyle(root);
  if (options.addEmploymentCount) {
    addRepeatBlocks(root, options.addEmploymentCount);
  }
  const snapshot = collectPageFields(root);
  const outcomes: FillOutcome[] = [];
  for (const instruction of instructions) {
    const element = locate(root, instruction);
    const occurrence = element
      ? fingerprintOccurrence(root, element)
      : (instruction.occurrence ?? 0);
    if (!element) {
      outcomes.push({
        fingerprint: instruction.fingerprint,
        occurrence,
        status: 'failed',
        reason: '页面上找不到该字段',
        previousValue: '',
      });
      continue;
    }
    if (instruction.kind === 'unknown') {
      outcomes.push({
        fingerprint: instruction.fingerprint,
        occurrence,
        status: 'unsupported',
        reason: '不支持的控件',
        previousValue: readControlValue(element),
      });
      highlightControl(element, 'unsupported');
      continue;
    }
    const unsafe = isUnsafeControl(element);
    if (unsafe) {
      outcomes.push({
        fingerprint: instruction.fingerprint,
        occurrence,
        status: 'skipped',
        reason: unsafe,
        previousValue: readControlValue(element),
      });
      highlightControl(element, 'skipped');
      continue;
    }
    const result = fillControl(element, instruction.value, instruction.kind);
    const outcome = {
      ...result,
      fingerprint: instruction.fingerprint,
      occurrence,
    };
    highlightControl(
      targetForHighlight(element, instruction.kind, instruction.value),
      outcome.status,
    );
    outcomes.push(outcome);
  }
  (options.newEmployments ?? []).forEach((record) => {
    const company = emptyNamed(root, 'company[]');
    const position = emptyNamed(root, 'position[]');
    if (company) {
      const fingerprint = controlFingerprint(company);
      const occurrence = fingerprintOccurrence(root, company);
      const result = fillControl(company, record.company, 'text');
      highlightControl(company, result.status);
      outcomes.push({ ...result, fingerprint, occurrence });
    }
    if (position) {
      const fingerprint = controlFingerprint(position);
      const occurrence = fingerprintOccurrence(root, position);
      const result = fillControl(position, record.position, 'text');
      highlightControl(position, result.status);
      outcomes.push({ ...result, fingerprint, occurrence });
    }
  });
  return {
    pageSignature: pageSignatureOf(snapshot),
    outcomes,
  };
}

export function undoFill(
  root: Document,
  session: FillSession,
): { ok: boolean; message?: string } {
  const current = pageSignatureOf(collectPageFields(root));
  if (current !== session.pageSignature) {
    return {
      ok: false,
      message: '页面已变化，未执行撤销，以免写入错误位置。',
    };
  }
  session.outcomes.forEach((outcome) => {
    if (outcome.status !== 'filled') return;
    const element = findControlByFingerprint(
      root,
      outcome.fingerprint,
      outcome.occurrence ?? 0,
    );
    if (!element) return;
    fillControl(
      element,
      outcome.previousValue,
      controlKindFromElement(element),
    );
    clearHighlight(element);
  });
  return { ok: true };
}

function locate(
  root: Document,
  instruction: FillInstruction,
): Element | undefined {
  const found = findControlByFingerprint(
    root,
    instruction.fingerprint,
    instruction.occurrence ?? 0,
  );
  if (found) return found;
  if (instruction.name) {
    const named = [
      ...Array.from(root.getElementsByName(instruction.name)),
      ...Array.from(root.getElementsByName(`${instruction.name}[]`)),
    ];
    return named[instruction.occurrence ?? 0] ?? named[0];
  }
  return undefined;
}

function ensureHighlightStyle(root: Document): void {
  if (root.getElementById('offer-nail-fill-highlight')) return;
  const style = root.createElement('style');
  style.id = 'offer-nail-fill-highlight';
  style.textContent = `
    [data-offer-nail-fill="filled"] { outline: 2px solid #2f6b3a; outline-offset: 2px; }
    [data-offer-nail-fill="skipped"] { outline: 2px dashed #9a7b2f; outline-offset: 2px; }
    [data-offer-nail-fill="failed"] { outline: 2px solid #8a2f2f; outline-offset: 2px; }
    [data-offer-nail-fill="unsupported"] { outline: 2px dashed #626b7c; outline-offset: 2px; }
  `;
  (root.head ?? root.documentElement).appendChild(style);
}

function emptyNamed(root: Document, name: string): Element | undefined {
  return Array.from(root.getElementsByName(name)).find(
    (node) => !(node as HTMLInputElement).value,
  );
}

function targetForHighlight(
  element: Element,
  kind: CollectedControlKind,
  value: string,
): Element {
  if (kind !== 'radio') return element;
  const input = element as HTMLInputElement;
  const scope = input.form ?? input.getRootNode();
  return (
    (scope as ParentNode).querySelector(
      `input[type="radio"][name="${input.name}"][value="${value}"]`,
    ) ?? element
  );
}

function controlKindFromElement(element: Element): CollectedControlKind {
  if (element.tagName === 'TEXTAREA') return 'textarea';
  if (element.tagName === 'SELECT') return 'select';
  const type = (element as HTMLInputElement).type;
  if (type === 'radio') return 'radio';
  if (type === 'checkbox') return 'checkbox';
  if (type === 'date') return 'date';
  return 'text';
}
