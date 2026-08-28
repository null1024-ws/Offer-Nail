/** @vitest-environment node */
import { createServer, type Server } from 'node:http';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFixtureFieldId,
  fixtureFieldExpectations,
} from './expected-mapping';

const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
const fixtureHtml = readFileSync(
  join(fixtureDirectory, 'application-form.html'),
  'utf8',
);

function queryByTestId(
  root: ParentNode,
  testId: string,
  inOpenShadow = false,
): Element | null {
  if (inOpenShadow) {
    const host = root.querySelector('#open-shadow-host');
    return host?.shadowRoot?.querySelector(`[data-testid="${testId}"]`) ?? null;
  }
  return root.querySelector(`[data-testid="${testId}"]`);
}

describe('application form fixture', () => {
  let server: Server;
  let baseUrl = '';
  let document: Document;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/' || request.url === '/application-form.html') {
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
        });
        response.end(fixtureHtml);
        return;
      }
      response.writeHead(404);
      response.end();
    });
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    const html = await (await fetch(`${baseUrl}/application-form.html`)).text();
    document = new JSDOM(html, {
      runScripts: 'dangerously',
      url: `${baseUrl}/application-form.html`,
    }).window.document;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('opens over localhost and exposes every expected control', () => {
    expect(document.title).toBe('Offer-Nail 本地测试表单');
    expect(document.querySelector('h1')?.textContent).toBe('本地招聘申请表');

    const seen = new Set<string>();
    fixtureFieldExpectations.forEach((expectation) => {
      assertFixtureFieldId(expectation.expectedFieldId);
      const node = queryByTestId(
        document,
        expectation.testId,
        'inOpenShadow' in expectation && expectation.inOpenShadow,
      );
      expect(node, expectation.testId).not.toBeNull();
      expect(seen.has(expectation.testId)).toBe(false);
      seen.add(expectation.testId);

      if (expectation.fillPolicy === 'skip') {
        expect(expectation.expectedFieldId).toBeNull();
        expect(expectation.skipReason).toBeTruthy();
      } else if (expectation.testId !== 'employment-add') {
        expect(expectation.expectedFieldId).toBeTruthy();
        expect(expectation.expectedFill.length).toBeGreaterThan(0);
      }
    });
  });

  it('keeps existing values, hides skip targets, and can add a repeat block', () => {
    expect(
      (queryByTestId(document, 'field-email') as HTMLInputElement).value,
    ).toBe('already@example.com');
    expect(
      (queryByTestId(document, 'employment-0-company') as HTMLInputElement)
        .value,
    ).toBe('示例科技有限公司');
    expect(
      document.defaultView?.getComputedStyle(
        queryByTestId(document, 'field-hidden-name') as HTMLInputElement,
      ).display,
    ).toBe('none');
    expect(
      (queryByTestId(document, 'field-disabled-id') as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      document.querySelector('#open-shadow-host')?.shadowRoot,
    ).not.toBeNull();
    expect(
      queryByTestId(document, 'field-closed-secret', true) ??
        queryByTestId(document, 'field-closed-secret'),
    ).toBeNull();

    const add = queryByTestId(document, 'employment-add') as HTMLButtonElement;
    add.click();
    expect(queryByTestId(document, 'employment-1-company')).not.toBeNull();
    expect(
      (queryByTestId(document, 'employment-1-company') as HTMLInputElement)
        .value,
    ).toBe('');
  });
});
