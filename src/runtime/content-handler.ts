import { applyFill, undoFill, type FillSession } from '../fill-engine/apply';
import { collectPageFields } from '../page-mapping/collector';
import type { ExtensionRequest, ExtensionResponse } from './protocol';

export function createContentHandler(root: Document = document) {
  let session: FillSession | undefined;

  return function handle(request: ExtensionRequest): ExtensionResponse {
    if (request.type === 'offerNail:ping') return { ok: true, pong: true };
    if (request.type === 'offerNail:collect') {
      return { ok: true, collection: collectPageFields(root) };
    }
    if (request.type === 'offerNail:applyFill') {
      session = applyFill(root, request.instructions, {
        addEmploymentCount: request.addEmploymentCount,
        newEmployments: request.newEmployments,
      });
      return { ok: true, outcomes: session.outcomes, session };
    }
    if (request.type === 'offerNail:undo') {
      if (!session) return { ok: false, error: '当前没有可撤销的填写。' };
      return { ok: true, undone: undoFill(root, session) };
    }
    return { ok: false, error: '未知请求' };
  };
}
