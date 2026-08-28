declare module 'jsdom' {
  export class JSDOM {
    constructor(
      html?: string,
      options?: {
        runScripts?: 'dangerously' | 'outside-only';
        url?: string;
      },
    );
    window: Window & typeof globalThis;
  }
}
