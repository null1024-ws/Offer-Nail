/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { loadFixtureDocument } from '../fill-engine/__fixtures__/form-fixture';
import { createContentHandler } from './content-handler';

describe('content handler', () => {
  it('collects, fills after apply, and undoes without submitting', () => {
    const document = loadFixtureDocument();
    let submitted = 0;
    document.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitted += 1;
    });
    const handle = createContentHandler(document);
    const collected = handle({ type: 'offerNail:collect' });
    expect(collected.ok).toBe(true);
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('');

    const name =
      collected.ok && 'collection' in collected
        ? collected.collection.fields.find((field) => field.name === 'fullName')
        : undefined;
    expect(name).toBeTruthy();
    handle({
      type: 'offerNail:applyFill',
      instructions: [
        {
          fingerprint: name!.fingerprint,
          name: name!.name,
          kind: 'text',
          value: '张三',
        },
      ],
    });
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('张三');
    const undone = handle({ type: 'offerNail:undo' });
    expect(undone.ok && 'undone' in undone && undone.undone.ok).toBe(true);
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('');
    expect(submitted).toBe(0);
  });
});
