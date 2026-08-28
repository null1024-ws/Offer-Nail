import {
  fieldCatalog,
  type FieldValueKind,
  type ResumeSection,
} from '../domain/resume/field-catalog';
import type { CollectedField, PageCollection } from './collector';
import {
  detectSectionContext,
  fieldDictionary,
  type FieldDictionaryEntry,
} from './dictionary';
import {
  attrKey,
  compactText,
  detectValueFormat,
  normalizeMappedValue,
  type ValueTransform,
} from './normalize';

export type MappingConfidence = 'high' | 'medium' | 'low';

export interface FieldMappingCandidate {
  fieldId: FieldDictionaryEntry['fieldId'];
  confidence: MappingConfidence;
  score: number;
  reasons: string[];
  transform: ValueTransform;
  normalizedValue: string;
}

export interface ScoredPageField {
  source: CollectedField;
  candidates: FieldMappingCandidate[];
  autoSelected?: FieldMappingCandidate;
}

const HIGH_SCORE = 70;
const MEDIUM_SCORE = 45;
const MIN_SCORE = 25;
const MARGIN = 15;

const LOCKED_SECTIONS = new Set<ResumeSection>([
  'education',
  'employment',
  'project',
  'research',
]);

export function scorePageFields(
  source: PageCollection | CollectedField[],
): ScoredPageField[] {
  const fields = Array.isArray(source) ? source : source.fields;
  return fields.map(scoreCollectedField);
}

export function scoreCollectedField(field: CollectedField): ScoredPageField {
  const ranked = fieldDictionary
    .map((entry) => scoreAgainst(field, entry))
    .filter(
      (candidate): candidate is FieldMappingCandidate => candidate !== null,
    )
    .sort((left, right) => right.score - left.score);

  const top = ranked[0];
  const runnerUp = ranked[1];
  const margin = top ? top.score - (runnerUp?.score ?? 0) : 0;
  const candidates = ranked.slice(0, 3).map((candidate, index) => {
    if (index !== 0 || !top) return candidate;
    const confidence = resolveConfidence(top.score, margin);
    const reasons =
      margin < MARGIN && runnerUp
        ? [
            ...candidate.reasons,
            `与「${fieldCatalog[runnerUp.fieldId].label}」分数接近，需要确认`,
          ]
        : candidate.reasons;
    return { ...candidate, confidence, reasons };
  });

  const winner = candidates[0];
  return {
    source: field,
    candidates,
    autoSelected: winner?.confidence === 'high' ? winner : undefined,
  };
}

function resolveConfidence(score: number, margin: number): MappingConfidence {
  if (score >= HIGH_SCORE && margin >= MARGIN) return 'high';
  if (score >= MEDIUM_SCORE) return 'medium';
  return 'low';
}

function scoreAgainst(
  field: CollectedField,
  entry: FieldDictionaryEntry,
): FieldMappingCandidate | null {
  const definition = fieldCatalog[entry.fieldId];
  if (!controlFits(definition.kind, field)) return null;

  let score = 0;
  const reasons: string[] = [];
  const label = compactText(field.label);
  const nearby = compactText(`${field.label} ${field.nearbyText}`);
  const attr = attrKey(field.name || field.idAttr);

  if (entry.synonyms.includes(label)) {
    score += 50;
    reasons.push(`标签匹配「${field.label}」`);
  } else {
    const contained = entry.synonyms
      .filter((synonym) => synonym.length >= 2 && nearby.includes(synonym))
      .sort((left, right) => right.length - left.length)[0];
    if (contained) {
      score += 30;
      reasons.push(`文案包含「${contained}」`);
    }
  }

  if (attr && entry.attrNames.includes(attr)) {
    score += 20;
    reasons.push(`属性名指向 ${entry.fieldId}`);
  }

  const section = detectSectionContext(field.group);
  if (section && section === entry.section) {
    score += 15;
    reasons.push(`分组「${field.group}」符合该模块`);
  } else if (
    section &&
    section !== entry.section &&
    (LOCKED_SECTIONS.has(section) || LOCKED_SECTIONS.has(entry.section))
  ) {
    score -= 25;
    reasons.push(`分组「${field.group}」与该模块不一致`);
  }

  score += 10;
  reasons.push(`控件类型 ${field.kind} 可用于该字段`);

  const format = field.currentValue
    ? detectValueFormat(field.currentValue, field.kind)
    : undefined;
  if (entry.valueHint && format) {
    if (format === entry.valueHint) {
      score += 15;
      reasons.push(`当前值符合${entry.valueHint}格式`);
    } else if (format !== 'text' && format !== 'boolean') {
      score -= 25;
      reasons.push(`当前值更像${format}，与该字段不符`);
    }
  }

  const optionText = field.options.join('');
  if (
    entry.valueHint === 'gender' &&
    /男/.test(optionText) &&
    /女/.test(optionText)
  ) {
    score += 20;
    reasons.push('选项为男/女');
  }
  if (
    entry.fieldId === 'education.educationLevel' &&
    /本科|硕士|博士|专科/.test(optionText)
  ) {
    score += 20;
    reasons.push('选项符合学历层次');
  }
  if (field.kind === 'textarea' && /summary|description/.test(entry.fieldId)) {
    score += 15;
    reasons.push('多行文本符合简介/描述类字段');
  }

  if (score < MIN_SCORE) return null;
  const normalized = normalizeMappedValue(
    field.currentValue,
    entry.valueHint ?? format ?? 'text',
  );
  return {
    fieldId: entry.fieldId,
    confidence: 'low',
    score,
    reasons,
    transform: normalized.transform,
    normalizedValue: normalized.value,
  };
}

function controlFits(kind: FieldValueKind, field: CollectedField): boolean {
  if (kind === 'attachment') return false;
  if (kind === 'boolean') {
    return (
      field.kind === 'checkbox' ||
      field.kind === 'radio' ||
      field.kind === 'select'
    );
  }
  if (kind === 'date' || kind === 'dateRange') {
    return field.kind === 'date' || field.kind === 'text';
  }
  return field.kind !== 'checkbox' && field.kind !== 'date';
}
