import { fieldCatalog, isResumeFieldId } from '../domain/resume/field-catalog';
import type { PageCollection } from './collector';
import { compactText } from './normalize';
import type { ValueTransform } from './normalize';
import type { FieldMappingCandidate, ScoredPageField } from './scorer';

export interface SiteMappingRule {
  id: string;
  origin: string;
  pageSignature: string;
  fieldFingerprint: string;
  targetFieldId: string;
  transform: ValueTransform;
  enabled: boolean;
  confirmedAt: string;
  lastSuccessAt?: string;
}

export function pageSignatureOf(collection: PageCollection): string {
  const fingerprints = collection.fields
    .map((field) => field.fingerprint)
    .sort()
    .join('|');
  return compactText(
    `${collection.origin}|${collection.title}|${fingerprints}`,
  );
}

export function rememberFieldMapping(input: {
  collection: PageCollection;
  fingerprint: string;
  targetFieldId: string;
  transform: ValueTransform;
  now?: string;
}): SiteMappingRule {
  if (!isResumeFieldId(input.targetFieldId)) {
    throw new Error(`未知字段 ID：${input.targetFieldId}`);
  }
  return {
    id: crypto.randomUUID(),
    origin: input.collection.origin,
    pageSignature: pageSignatureOf(input.collection),
    fieldFingerprint: input.fingerprint,
    targetFieldId: input.targetFieldId,
    transform: input.transform,
    enabled: true,
    confirmedAt: input.now ?? new Date().toISOString(),
  };
}

export function ruleContainsResumeValue(
  rule: SiteMappingRule,
  values: string[],
): boolean {
  const serialized = JSON.stringify(rule);
  return values.some(
    (value) => value.trim().length > 0 && serialized.includes(value),
  );
}

export function applySiteRules(
  scored: ScoredPageField[],
  rules: SiteMappingRule[],
  collection: PageCollection,
): ScoredPageField[] {
  const signature = pageSignatureOf(collection);
  return scored.map((entry) => {
    const rule = rules.find(
      (item) =>
        item.enabled &&
        item.origin === collection.origin &&
        item.fieldFingerprint === entry.source.fingerprint &&
        isResumeFieldId(item.targetFieldId),
    );
    if (!rule || !isResumeFieldId(rule.targetFieldId)) return entry;
    if (rule.pageSignature !== signature) {
      return {
        ...entry,
        candidates: [
          {
            fieldId: rule.targetFieldId,
            confidence: 'medium',
            score: 40,
            reasons: ['页面结构已变化，未套用旧网站规则'],
            transform: rule.transform,
            normalizedValue: entry.source.currentValue,
          },
          ...entry.candidates,
        ],
      };
    }
    const selected: FieldMappingCandidate = {
      fieldId: rule.targetFieldId,
      confidence: 'high',
      score: 100,
      reasons: [`复用网站规则：${fieldCatalog[rule.targetFieldId].label}`],
      transform: rule.transform,
      normalizedValue: entry.source.currentValue,
    };
    return {
      ...entry,
      autoSelected: selected,
      candidates: [
        selected,
        ...entry.candidates.filter(
          (candidate) => candidate.fieldId !== selected.fieldId,
        ),
      ],
    };
  });
}
