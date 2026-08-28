import type { ResumeData } from '../domain/resume/schema';
import type { PageCollection } from '../page-mapping/collector';
import {
  applySiteRules,
  rememberFieldMapping,
  type SiteMappingRule,
} from '../page-mapping/rules';
import { scorePageFields, type ScoredPageField } from '../page-mapping/scorer';
import type { FillInstruction } from './adapters';
import {
  buildFillPreview,
  extraRepeatCount,
  extraSectionRecords,
  selectedInstructions,
  type FillPreviewItem,
} from './preview';

export interface PageFillPlan {
  scored: ScoredPageField[];
  items: FillPreviewItem[];
  addEmploymentCount: number;
  newEmployments: Array<{ company: string; position: string }>;
}

export function planPageFill(
  collection: PageCollection,
  resume: ResumeData,
  rules: SiteMappingRule[] = [],
): PageFillPlan {
  const scored = applySiteRules(scorePageFields(collection), rules, collection);
  const existing = scored.filter((entry) => {
    const chosen = entry.autoSelected ?? entry.candidates[0];
    return chosen?.fieldId === 'employment.company';
  }).length;
  return {
    scored,
    items: buildFillPreview(scored, resume, collection),
    addEmploymentCount: extraRepeatCount(scored, resume, 'employment.company'),
    newEmployments: extraSectionRecords(
      resume,
      'employment.company',
      existing,
    ).map((record) => ({
      company: record['employment.company'] ?? '',
      position: record['employment.position'] ?? '',
    })),
  };
}

export function fillRequestFromPreview(
  items: FillPreviewItem[],
  plan: PageFillPlan,
): {
  instructions: FillInstruction[];
  addEmploymentCount: number;
  newEmployments: PageFillPlan['newEmployments'];
} {
  return {
    instructions: selectedInstructions(items),
    addEmploymentCount: plan.addEmploymentCount,
    newEmployments: plan.newEmployments,
  };
}

export function rulesFromConfirmedFill(
  collection: PageCollection,
  items: FillPreviewItem[],
  scored: ScoredPageField[],
): SiteMappingRule[] {
  return items
    .filter((item) => item.selected && item.fingerprint && item.fieldId)
    .map((item) =>
      rememberFieldMapping({
        collection,
        fingerprint: item.fingerprint,
        targetFieldId: item.fieldId!,
        transform:
          scored
            .find((entry) => entry.source.fingerprint === item.fingerprint)
            ?.candidates.find((candidate) => candidate.fieldId === item.fieldId)
            ?.transform ?? 'identity',
      }),
    );
}
