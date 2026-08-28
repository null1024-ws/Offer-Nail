import type { CollectedControlKind } from './collector';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1[3-9]\d{9}$/;
const DATE_RE =
  /^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/;
const URL_RE = /^https?:\/\//i;

export type ValueFormat =
  'email' | 'phone' | 'url' | 'github' | 'date' | 'boolean' | 'gender' | 'text';

export type ValueTransform =
  'identity' | 'email' | 'phone' | 'date' | 'boolean' | 'url';

export function compactText(value: string): string {
  return value
    .toLowerCase()
    .replace(/github url\/id/g, 'github')
    .replace(/[\s:：_\-()（）[\]/.、，]/g, '');
}

export function attrKey(value: string): string {
  return compactText(
    value
      .replace(/\[\]$/g, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-./]/g, ' '),
  );
}

export function detectValueFormat(
  value: string,
  kind: CollectedControlKind,
): ValueFormat {
  const trimmed = value.trim();
  if (kind === 'checkbox' || /^(true|false|是|否|on|off)$/i.test(trimmed)) {
    return 'boolean';
  }
  if (kind === 'date' || DATE_RE.test(trimmed)) return 'date';
  if (EMAIL_RE.test(trimmed)) return 'email';
  if (PHONE_RE.test(trimmed.replace(/\s+/g, ''))) return 'phone';
  if (/github\.com/i.test(trimmed) || /^github$/i.test(trimmed))
    return 'github';
  if (URL_RE.test(trimmed)) return 'url';
  if (trimmed === '男' || trimmed === '女') return 'gender';
  return 'text';
}

export function normalizeMappedValue(
  raw: string,
  format: ValueFormat,
): { value: string; transform: ValueTransform } {
  const trimmed = raw.trim();
  if (format === 'email') {
    return { value: trimmed.toLowerCase(), transform: 'email' };
  }
  if (format === 'phone') {
    return { value: trimmed.replace(/\D/g, ''), transform: 'phone' };
  }
  if (format === 'date') {
    return { value: trimmed, transform: 'date' };
  }
  if (format === 'boolean') {
    return {
      value: /^(true|是|on|1)$/i.test(trimmed) ? 'true' : 'false',
      transform: 'boolean',
    };
  }
  if (format === 'url' || format === 'github') {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    return { value: withProtocol, transform: 'url' };
  }
  return { value: trimmed, transform: 'identity' };
}
