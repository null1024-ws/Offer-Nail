/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { fillControl, readControlValue } from './adapters';
import { loadFixtureDocument } from './__fixtures__/form-fixture';

describe('fillControl', () => {
  it('writes native controls and dispatches input/change for the controlled city', () => {
    const document = loadFixtureDocument();
    const city = document.getElementById('current-city') as HTMLInputElement;
    let inputs = 0;
    city.addEventListener('input', () => {
      inputs += 1;
    });
    city.addEventListener('change', () => {
      inputs += 1;
    });
    const result = fillControl(city, '北京', 'text');
    expect(result.status).toBe('filled');
    expect(result.previousValue).toBe('');
    expect(city.value).toBe('北京');
    expect(readControlValue(city)).toBe('北京');
    expect(inputs).toBeGreaterThanOrEqual(2);
  });
});
