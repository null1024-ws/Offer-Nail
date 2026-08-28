export type RuntimeTarget = 'background' | 'content' | 'options' | 'popup';

export interface RuntimeHealth {
  product: 'Offer-Nail';
  target: RuntimeTarget;
  ready: true;
}

export function createRuntimeHealth(target: RuntimeTarget): RuntimeHealth {
  return {
    product: 'Offer-Nail',
    target,
    ready: true,
  };
}
