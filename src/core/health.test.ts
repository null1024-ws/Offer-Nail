import { describe, expect, it } from 'vitest';
import { createRuntimeHealth } from './health';

describe('createRuntimeHealth', () => {
  it('returns a stable ready-state payload for an extension target', () => {
    expect(createRuntimeHealth('background')).toEqual({
      product: 'Offer-Nail',
      target: 'background',
      ready: true,
    });
  });
});
