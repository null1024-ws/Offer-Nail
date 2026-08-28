/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { collectPageFields } from '../page-mapping/collector';
import { scorePageFields } from '../page-mapping/scorer';
import { fillControl } from './adapters';
import { applyFill, undoFill } from './apply';
import type { FillInstruction } from './adapters';
import {
  extraRepeatCount,
  extraSectionRecords,
  selectedInstructions,
  buildFillPreview,
} from './preview';
import { loadFixtureDocument, seededResume } from './__fixtures__/form-fixture';

function previewFor(document: Document) {
  const collection = collectPageFields(document);
  const scored = scorePageFields(collection);
  return {
    collection,
    scored,
    items: buildFillPreview(scored, seededResume(), collection),
  };
}

describe('applyFill', () => {
  it('fills selected basic controls and never submits', () => {
    const document = loadFixtureDocument();
    let submitted = 0;
    document.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      submitted += 1;
    });
    const { collection, items } = previewFor(document);
    const extra: FillInstruction[] = [];
    const gender = collection.fields.find((field) => field.name === 'gender');
    const remote = collection.fields.find(
      (field) => field.name === 'acceptRemote',
    );
    const date = collection.fields.find((field) => field.name === 'birthDate');
    const level = collection.fields.find(
      (field) => field.name === 'educationLevel',
    );
    if (gender) {
      extra.push({
        fingerprint: gender.fingerprint,
        name: gender.name,
        kind: 'radio',
        value: '男',
      });
    }
    if (remote) {
      extra.push({
        fingerprint: remote.fingerprint,
        name: remote.name,
        kind: 'checkbox',
        value: 'true',
      });
    }
    if (date) {
      extra.push({
        fingerprint: date.fingerprint,
        name: date.name,
        kind: 'date',
        value: '1998-06-15',
      });
    }
    if (level) {
      extra.push({
        fingerprint: level.fingerprint,
        name: level.name,
        kind: 'select',
        value: '本科',
      });
    }

    const session = applyFill(document, [
      ...selectedInstructions(items),
      ...extra,
    ]);
    expect(submitted).toBe(0);
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('张三');
    expect(
      (document.getElementById('summary') as HTMLTextAreaElement).value,
    ).toContain('本地优先');
    expect(
      (document.getElementById('current-city') as HTMLInputElement).value,
    ).toBe('北京');
    expect((document.getElementById('school') as HTMLInputElement).value).toBe(
      '清华大学',
    );
    expect(
      (
        document.querySelector(
          '[name="gender"][value="男"]',
        ) as HTMLInputElement
      ).checked,
    ).toBe(true);
    expect(
      (document.getElementById('accept-remote') as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (document.getElementById('education-level') as HTMLSelectElement).value,
    ).toBe('本科');
    expect(
      (document.getElementById('birth-date') as HTMLInputElement).value,
    ).toBe('1998-06-15');
    expect((document.getElementById('email') as HTMLInputElement).value).toBe(
      'already@example.com',
    );
    expect(
      (document.getElementById('identity-document') as HTMLInputElement).value,
    ).toBe('已禁用');
    expect(
      (document.getElementById('hidden-name') as HTMLInputElement).value,
    ).toBe('不应采集');
    expect(session.outcomes.some((item) => item.status === 'filled')).toBe(
      true,
    );
    expect(
      (document.getElementById('full-name') as HTMLElement).dataset
        .offerNailFill,
    ).toBe('filled');
    expect(document.getElementById('offer-nail-fill-highlight')).not.toBeNull();

    const hidden = fillControl(
      document.getElementById('hidden-name')!,
      '被改写',
      'text',
    );
    const disabled = fillControl(
      document.getElementById('identity-document')!,
      '被改写',
      'text',
    );
    const submit = fillControl(
      document.querySelector('[data-testid="submit-application"]')!,
      '提交',
      'unknown',
    );
    expect(hidden.status).toBe('skipped');
    expect(disabled.status).toBe('skipped');
    expect(submit.status).toBe('skipped');
    expect(
      (document.getElementById('hidden-name') as HTMLInputElement).value,
    ).toBe('不应采集');
    expect(
      (document.getElementById('identity-document') as HTMLInputElement).value,
    ).toBe('已禁用');
    expect(submitted).toBe(0);
  });

  it('fills controlled city and a newly added employment block after confirmation', () => {
    const document = loadFixtureDocument();
    const resume = seededResume();
    const { scored } = previewFor(document);
    const existing = scored.filter((entry) => {
      const chosen = entry.autoSelected ?? entry.candidates[0];
      return chosen?.fieldId === 'employment.company';
    }).length;
    const extra = extraRepeatCount(scored, resume, 'employment.company');
    const records = extraSectionRecords(
      resume,
      'employment.company',
      existing,
    ).map((record) => ({
      company: record['employment.company'] ?? '',
      position: record['employment.position'] ?? '',
    }));

    applyFill(document, [], {
      addEmploymentCount: extra,
      newEmployments: records,
    });
    expect(document.querySelectorAll('.employment-item')).toHaveLength(2);
    const companies = Array.from(document.getElementsByName('company[]')).map(
      (node) => (node as HTMLInputElement).value,
    );
    expect(companies).toEqual(['示例科技有限公司', '第二段实习公司']);
    expect(
      (
        document.querySelector('[data-testid="field-unsupported-combobox"]') as
          HTMLElement | undefined
      )?.textContent,
    ).toContain('请选择职级');
  });

  it('undoes filled values and refuses after the page structure changes', () => {
    const document = loadFixtureDocument();
    const { items } = previewFor(document);
    const session = applyFill(document, selectedInstructions(items));
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('张三');
    expect(undoFill(document, session)).toEqual({ ok: true });
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('');
    expect(
      (document.getElementById('full-name') as HTMLElement).dataset
        .offerNailFill,
    ).toBeUndefined();

    const filled = applyFill(document, selectedInstructions(items));
    document.getElementById('employment-add')?.click();
    const expired = undoFill(document, filled);
    expect(expired.ok).toBe(false);
    expect(expired.message).toContain('页面已变化');
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('张三');
  });

  it('restores only the newly filled employment row on undo', () => {
    const document = loadFixtureDocument();
    const session = applyFill(document, [], {
      addEmploymentCount: 1,
      newEmployments: [{ company: '第二段实习公司', position: '研发实习生' }],
    });
    expect(undoFill(document, session)).toEqual({ ok: true });
    const companies = Array.from(document.getElementsByName('company[]')).map(
      (node) => (node as HTMLInputElement).value,
    );
    expect(companies).toEqual(['示例科技有限公司', '']);
  });
});
