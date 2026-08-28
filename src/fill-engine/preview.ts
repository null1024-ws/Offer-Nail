import {
  fieldCatalog,
  type ResumeFieldId,
} from '../domain/resume/field-catalog';
import type { ResumeData } from '../domain/resume/schema';
import type { PageCollection } from '../page-mapping/collector';
import type {
  MappingConfidence,
  ScoredPageField,
} from '../page-mapping/scorer';
import type { FillInstruction } from './adapters';
import {
  formatProfileValue,
  resolveProfileValue,
  resolveSectionValues,
} from './values';

export interface FillPreviewItem {
  sourceId: string;
  fingerprint: string;
  pageLabel: string;
  pageKind: ScoredPageField['source']['kind'];
  pageName: string;
  pageValue: string;
  inShadow: boolean;
  fieldId?: ResumeFieldId;
  proposedValue: string;
  confidence: MappingConfidence | 'none';
  reasons: string[];
  sensitive: boolean;
  conflict: boolean;
  unsupported?: string;
  selected: boolean;
  mappingOptions: Array<{ fieldId: ResumeFieldId; label: string }>;
}

export function buildFillPreview(
  scored: ScoredPageField[],
  resume: ResumeData,
  collection?: PageCollection,
): FillPreviewItem[] {
  const items = scored.map((entry) => {
    const chosen = entry.autoSelected ?? entry.candidates[0];
    const fieldId = chosen?.fieldId;
    const proposedValue = fieldId
      ? formatProfileValue(resolveProfileValue(resume, fieldId))
      : '';
    const sensitive = fieldId
      ? fieldCatalog[fieldId].sensitivity !== 'normal'
      : false;
    const conflict = entry.source.currentValue.trim().length > 0;
    const confidence = chosen?.confidence ?? 'none';
    const unsupported = !fieldId ? '未能映射到档案字段' : undefined;
    const item: FillPreviewItem = {
      sourceId: entry.source.id,
      fingerprint: entry.source.fingerprint,
      pageLabel: entry.source.label || entry.source.name,
      pageKind: entry.source.kind,
      pageName: entry.source.name,
      pageValue: entry.source.currentValue,
      inShadow: entry.source.inShadow,
      fieldId,
      proposedValue,
      confidence,
      reasons: chosen?.reasons ?? ['没有足够的映射依据'],
      sensitive,
      conflict,
      unsupported,
      selected: false,
      mappingOptions: entry.candidates.map((candidate) => ({
        fieldId: candidate.fieldId,
        label: fieldCatalog[candidate.fieldId].label,
      })),
    };
    item.selected = shouldAutoSelect(item);
    return item;
  });

  const extras =
    collection?.inaccessible.map((region, index) => ({
      sourceId: `inaccessible:${index}`,
      fingerprint: '',
      pageLabel: region.description,
      pageKind: 'unknown' as const,
      pageName: '',
      pageValue: '',
      inShadow: false,
      proposedValue: '',
      confidence: 'none' as const,
      reasons: [`不支持：${region.reason}`],
      sensitive: false,
      conflict: false,
      unsupported: region.reason,
      selected: false,
      mappingOptions: [],
    })) ?? [];

  return [...items, ...extras];
}

export function shouldAutoSelect(item: FillPreviewItem): boolean {
  return (
    !item.unsupported &&
    Boolean(item.fieldId && item.proposedValue) &&
    item.confidence === 'high' &&
    !item.sensitive &&
    !item.conflict
  );
}

export function extraRepeatCount(
  scored: ScoredPageField[],
  resume: ResumeData,
  fieldId: ResumeFieldId,
): number {
  const pageCount = scored.filter((entry) => {
    const chosen = entry.autoSelected ?? entry.candidates[0];
    return chosen?.fieldId === fieldId;
  }).length;
  return Math.max(
    0,
    resolveSectionValues(resume, fieldCatalog[fieldId].section).length -
      pageCount,
  );
}

export function extraSectionRecords(
  resume: ResumeData,
  fieldId: ResumeFieldId,
  existingCount: number,
): Array<Partial<Record<ResumeFieldId, string>>> {
  return resolveSectionValues(resume, fieldCatalog[fieldId].section).slice(
    existingCount,
  );
}

export function selectedInstructions(
  items: FillPreviewItem[],
): FillInstruction[] {
  return items
    .filter((item) => item.selected && item.fingerprint)
    .map((item) => ({
      fingerprint: item.fingerprint,
      name: item.pageName,
      kind: item.pageKind,
      value: item.proposedValue,
    }));
}

export function retargetPreviewItem(
  item: FillPreviewItem,
  fieldId: ResumeFieldId,
  resume: ResumeData,
): FillPreviewItem {
  const sensitive = fieldCatalog[fieldId].sensitivity !== 'normal';
  const proposedValue = formatProfileValue(
    resolveProfileValue(resume, fieldId),
  );
  const next = {
    ...item,
    fieldId,
    proposedValue,
    sensitive,
    unsupported: undefined,
  };
  return { ...next, selected: shouldAutoSelect(next) && item.selected };
}
