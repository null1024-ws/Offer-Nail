import type { CollectedControlKind } from '../page-mapping/collector';

export interface FillInstruction {
  fingerprint: string;
  name: string;
  kind: CollectedControlKind;
  value: string;
  occurrence?: number;
}

export type FillStatus = 'filled' | 'skipped' | 'failed' | 'unsupported';

export interface FillOutcome {
  fingerprint: string;
  status: FillStatus;
  reason?: string;
  previousValue: string;
  occurrence?: number;
}

interface PageWindow {
  Event: { new (type: string, init?: EventInit): Event };
}

function pageWindow(element: Element): PageWindow | null {
  return element.ownerDocument.defaultView as PageWindow | null;
}

function dispatchInput(element: Element): void {
  const EventCtor = pageWindow(element)?.Event ?? Event;
  element.dispatchEvent(new EventCtor('input', { bubbles: true }));
  element.dispatchEvent(new EventCtor('change', { bubbles: true }));
}

function nativeSetter(
  element: Element,
  property: 'value' | 'checked',
): ((value: unknown) => void) | undefined {
  return Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(element),
    property,
  )?.set;
}

export function readControlValue(element: Element): string {
  if (element.tagName === 'SELECT') {
    const select = element as HTMLSelectElement;
    return select.options[select.selectedIndex]?.text ?? select.value;
  }
  const input = element as HTMLInputElement;
  if (input.type === 'checkbox') return input.checked ? 'true' : 'false';
  if (input.type === 'radio') return input.checked ? input.value : '';
  return input.value ?? '';
}

export function isUnsafeControl(element: Element): string | undefined {
  const input = element as HTMLInputElement;
  if (element.tagName === 'BUTTON' || input.type === 'submit') {
    return '不会操作提交控件';
  }
  if (input.disabled) return '控件已禁用';
  const style = element.ownerDocument.defaultView?.getComputedStyle(element);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) {
    return '控件不可见';
  }
  return undefined;
}

export function fillControl(
  element: Element,
  value: string,
  kind: CollectedControlKind,
): FillOutcome {
  const previousValue = readControlValue(element);
  const unsafe = isUnsafeControl(element);
  if (unsafe) {
    return {
      fingerprint: '',
      status: 'skipped',
      reason: unsafe,
      previousValue,
    };
  }
  try {
    if (kind === 'radio' || (element as HTMLInputElement).type === 'radio') {
      chooseRadio(element as HTMLInputElement, value);
    } else if (
      kind === 'checkbox' ||
      (element as HTMLInputElement).type === 'checkbox'
    ) {
      setChecked(
        element as HTMLInputElement,
        value === 'true' || value === '是',
      );
    } else if (element.tagName === 'SELECT') {
      chooseSelect(element as HTMLSelectElement, value);
    } else {
      setTextValue(element, value);
    }
    return { fingerprint: '', status: 'filled', previousValue };
  } catch (error) {
    return {
      fingerprint: '',
      status: 'failed',
      reason: error instanceof Error ? error.message : '写入失败',
      previousValue,
    };
  }
}

function setTextValue(element: Element, value: string): void {
  const setter = nativeSetter(element, 'value');
  if (setter) setter.call(element, value);
  else (element as HTMLInputElement).value = value;
  dispatchInput(element);
}

function setChecked(element: HTMLInputElement, checked: boolean): void {
  const setter = nativeSetter(element, 'checked');
  if (setter) setter.call(element, checked);
  else element.checked = checked;
  dispatchInput(element);
}

function chooseRadio(element: HTMLInputElement, value: string): void {
  const scope = element.form ?? element.getRootNode();
  const radios = Array.from(
    (scope as ParentNode).querySelectorAll(
      `input[type="radio"][name="${element.name}"]`,
    ),
  ) as HTMLInputElement[];
  if (!value.trim()) {
    radios.forEach((radio) => setChecked(radio, false));
    return;
  }
  const match =
    radios.find((radio) => radio.value === value) ??
    radios.find((radio) => radio.getAttribute('value') === value);
  if (!match) throw new Error(`没有匹配「${value}」的选项`);
  setChecked(match, true);
}

function chooseSelect(element: HTMLSelectElement, value: string): void {
  const option = Array.from(element.options).find(
    (item) => item.text === value || item.value === value,
  );
  if (!option) throw new Error(`下拉框没有「${value}」`);
  const setter = nativeSetter(element, 'value');
  if (setter) setter.call(element, option.value);
  else element.value = option.value;
  dispatchInput(element);
}
