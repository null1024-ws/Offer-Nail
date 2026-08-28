import { z } from 'zod';
import {
  fieldCatalog,
  isResumeFieldId,
  type ResumeFieldId,
  type ResumeSection,
} from '../domain/resume/field-catalog';
import type { FieldValue } from '../domain/resume/schema';
import { parseDate, parseRange, type FieldCandidate } from '../parser/candidates';
import { chatJsonCompletion, LlmRequestError } from './deepseek';
import {
  buildLlmSystemPrompt,
  buildLlmUserPrompt,
  llmOutputSchema,
  type LlmOutput,
} from './prompt';

const KEY_TO_SECTION: Record<string, ResumeSection> = {
  personal: 'personal',
  jobPreference: 'jobPreference',
  educations: 'education',
  employments: 'employment',
  projects: 'project',
  researches: 'research',
  languages: 'language',
  skills: 'skill',
  certificates: 'certificate',
  awards: 'award',
  campusExperiences: 'campus',
  volunteerExperiences: 'volunteer',
  trainings: 'training',
  portfolios: 'portfolio',
  intellectualProperties: 'intellectualProperty',
};

const REPEAT_KEYS = new Set([
  'educations',
  'employments',
  'projects',
  'researches',
  'languages',
  'skills',
  'certificates',
  'awards',
  'campusExperiences',
  'volunteerExperiences',
  'trainings',
  'portfolios',
  'intellectualProperties',
]);

function asText(value: string | number | boolean | string[]): string {
  if (Array.isArray(value)) return value.join('；');
  return String(value);
}

function coerceValue(
  fieldId: ResumeFieldId,
  raw: string | number | boolean | string[],
): FieldValue | undefined {
  const kind = fieldCatalog[fieldId].kind;
  const text = asText(raw).trim();
  if (!text) return undefined;

  if (kind === 'text') return { kind: 'text', value: text };
  if (kind === 'url') {
    const withProtocol = /^https?:\/\//i.test(text)
      ? text
      : `https://${text}`;
    const parsed = z.url().safeParse(withProtocol);
    return parsed.success
      ? { kind: 'url', value: parsed.data }
      : { kind: 'text', value: text };
  }
  if (kind === 'number') {
    const numeric = Number(text.replace(/[^\d.-]/g, ''));
    if (!Number.isFinite(numeric)) return undefined;
    return { kind: 'number', value: numeric };
  }
  if (kind === 'boolean') {
    return {
      kind: 'boolean',
      value: /^(true|是|1|yes|y)$/i.test(text),
    };
  }
  if (kind === 'date') {
    const parsed = parseDate(text);
    return parsed ? { kind: 'date', value: parsed } : undefined;
  }
  if (kind === 'dateRange') {
    const parsed = parseRange(text);
    return parsed && parsed.kind === 'dateRange' ? parsed : undefined;
  }
  if (kind === 'stringList') {
    const values = text
      .split(/[；;、,\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
    return values.length > 0 ? { kind: 'stringList', value: values } : undefined;
  }
  return undefined;
}

function toCandidate(
  section: ResumeSection,
  shortKey: string,
  raw: string | number | boolean | string[],
  recordKey: string,
): FieldCandidate | undefined {
  const fieldId = `${section}.${shortKey}`;
  if (!isResumeFieldId(fieldId)) return undefined;
  const value = coerceValue(fieldId, raw);
  if (!value) return undefined;
  return {
    fieldId,
    value,
    confidence: 'medium',
    recordKey,
    source: { lineId: `llm:${fieldId}:${recordKey}`, text: asText(raw) },
  };
}

export function candidatesFromLlm(output: LlmOutput): FieldCandidate[] {
  const candidates: FieldCandidate[] = [];
  for (const [topKey, section] of Object.entries(KEY_TO_SECTION)) {
    if (!(topKey in output)) continue;
    if (REPEAT_KEYS.has(topKey)) {
      const records = output[topKey as keyof LlmOutput] as
        | Array<Record<string, string | number | boolean | string[]>>
        | undefined;
      records?.forEach((map, index) => {
        for (const [shortKey, raw] of Object.entries(map)) {
          const candidate = toCandidate(
            section,
            shortKey,
            raw,
            `${section}:${index}`,
          );
          if (candidate) candidates.push(candidate);
        }
      });
    } else {
      const map = output[topKey as keyof LlmOutput] as
        | Record<string, string | number | boolean | string[]>
        | undefined;
      if (!map) continue;
      for (const [shortKey, raw] of Object.entries(map)) {
        const candidate = toCandidate(section, shortKey, raw, section);
        if (candidate) candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function valueKey(fieldId: string, value: FieldValue): string {
  const raw = 'value' in value ? value.value : undefined;
  return `${fieldId}:${JSON.stringify(raw)}`;
}

export function mergeCandidates(
  rule: FieldCandidate[],
  llm: FieldCandidate[],
): FieldCandidate[] {
  const seen = new Set<string>();
  for (const candidate of rule) {
    seen.add(valueKey(candidate.fieldId, candidate.value));
  }
  const additions = llm.filter((candidate) => {
    const key = valueKey(candidate.fieldId, candidate.value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...rule, ...additions];
}

export function parseLlmOutput(raw: string): LlmOutput {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  const json = start === -1 || end === -1 ? trimmed : trimmed.slice(start, end + 1);
  return llmOutputSchema.parse(JSON.parse(json));
}

export interface ExtractWithLlmOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export async function extractResumeWithLlm(
  resumeText: string,
  options: ExtractWithLlmOptions,
): Promise<FieldCandidate[]> {
  const content = await chatJsonCompletion(
    [
      { role: 'system', content: buildLlmSystemPrompt() },
      { role: 'user', content: buildLlmUserPrompt(resumeText) },
    ],
    options,
  );
  return candidatesFromLlm(parseLlmOutput(content));
}

export { LlmRequestError };
