/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { collectPageFields } from '../page-mapping/collector';
import { loadFixtureDocument, seededResume } from './__fixtures__/form-fixture';
import { fillRequestFromPreview, planPageFill } from './plan';

describe('planPageFill', () => {
  it('builds a confirmable plan without writing the page', () => {
    const document = loadFixtureDocument();
    const collection = collectPageFields(document);
    const plan = planPageFill(collection, seededResume());
    expect(plan.addEmploymentCount).toBe(1);
    expect(plan.newEmployments[0]?.company).toBe('第二段实习公司');
    expect(
      (document.getElementById('full-name') as HTMLInputElement).value,
    ).toBe('');
    const request = fillRequestFromPreview(
      plan.items.filter((item) => item.selected),
      plan,
    );
    expect(request.instructions.some((item) => item.value === '张三')).toBe(
      true,
    );
  });
});
