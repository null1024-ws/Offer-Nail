/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { collectPageFields } from '../page-mapping/collector';
import { scorePageFields } from '../page-mapping/scorer';
import { loadFixtureDocument, seededResume } from './__fixtures__/form-fixture';
import { buildFillPreview, extraRepeatCount } from './preview';

describe('buildFillPreview', () => {
  it('auto-selects only high-confidence, non-sensitive, empty page fields', () => {
    const document = loadFixtureDocument();
    const collection = collectPageFields(document);
    const items = buildFillPreview(
      scorePageFields(collection),
      seededResume(),
      collection,
    );
    const selected = items
      .filter((item) => item.selected)
      .map((item) => item.fieldId);

    expect(selected).toContain('personal.fullName');
    expect(selected).toContain('personal.summary');
    expect(selected).toContain('personal.currentCity');
    expect(selected).toContain('education.school');
    expect(selected).not.toContain('personal.phone');
    expect(selected).not.toContain('personal.email');
    expect(selected).not.toContain('personal.gender');
    expect(selected).not.toContain('personal.birthDate');
    expect(selected).not.toContain('employment.company');
    expect(
      items.find((item) => item.pageLabel === '职级')?.unsupported,
    ).toBeTruthy();
    expect(items.some((item) => item.unsupported === 'closedShadow')).toBe(
      true,
    );
    expect(
      extraRepeatCount(
        scorePageFields(collection),
        seededResume(),
        'employment.company',
      ),
    ).toBe(1);
  });

  it('does not mutate the page when preview is only built', () => {
    const document = loadFixtureDocument();
    const name = document.getElementById('full-name') as HTMLInputElement;
    expect(name.value).toBe('');
    buildFillPreview(
      scorePageFields(collectPageFields(document)),
      seededResume(),
    );
    expect(name.value).toBe('');
    expect(
      (
        document.querySelector('[data-testid="submit-application"]') as
          HTMLButtonElement | undefined
      )?.type,
    ).toBe('submit');
  });
});
