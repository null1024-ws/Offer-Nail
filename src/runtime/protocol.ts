import type { ResumeData } from '../domain/resume/schema';
import type { FillInstruction, FillOutcome } from '../fill-engine/adapters';
import type { FillSession } from '../fill-engine/apply';
import type { FillPreviewItem } from '../fill-engine/preview';
import type { PageCollection } from '../page-mapping/collector';

export type ExtensionRequest =
  | { type: 'offerNail:ping' }
  | { type: 'offerNail:status' }
  | { type: 'offerNail:lock' }
  | { type: 'offerNail:replacePayload'; data: ResumeData }
  | { type: 'offerNail:scan'; variantId?: string }
  | { type: 'offerNail:confirmFill'; items: FillPreviewItem[] }
  | { type: 'offerNail:undoFill' }
  | { type: 'offerNail:collect' }
  | {
      type: 'offerNail:applyFill';
      instructions: FillInstruction[];
      addEmploymentCount?: number;
      newEmployments?: Array<{ company: string; position: string }>;
    }
  | { type: 'offerNail:undo' };

export type ExtensionResponse =
  | { ok: true }
  | { ok: true; pong: true }
  | {
      ok: true;
      status: 'uninitialized' | 'locked' | 'unlocked';
      profileName?: string;
      variants?: Array<{ id: string; name: string }>;
    }
  | {
      ok: true;
      items: FillPreviewItem[];
      resume: ResumeData;
    }
  | { ok: true; collection: PageCollection }
  | { ok: true; outcomes: FillOutcome[]; session: FillSession }
  | { ok: true; undone: { ok: boolean; message?: string } }
  | { ok: false; error: string };

export function isExtensionRequest(value: unknown): value is ExtensionRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    value.type.startsWith('offerNail:')
  );
}
