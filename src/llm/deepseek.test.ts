import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatJsonCompletion, LlmRequestError } from './deepseek';

describe('chatJsonCompletion', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts to the chat completions endpoint and returns content', async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetch);

    const content = await chatJsonCompletion(
      [{ role: 'user', content: 'parse as json' }],
      { apiKey: 'sk-test', model: 'deepseek-v4-flash' },
    );

    expect(content).toBe('{"ok":true}');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepseek.com/chat/completions');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer sk-test',
    });
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('deepseek-v4-flash');
    expect(body.response_format).toEqual({ type: 'json_object' });
  });

  it('reports an invalid key on 401', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    await expect(
      chatJsonCompletion([{ role: 'user', content: 'x' }], {
        apiKey: 'bad',
        model: 'deepseek-v4-flash',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_KEY' });
  });

  it('reports rate limiting on 429', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 429 })),
    );
    await expect(
      chatJsonCompletion([{ role: 'user', content: 'x' }], {
        apiKey: 'sk',
        model: 'deepseek-v4-flash',
      }),
    ).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('reports empty content when the model returns nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      ),
    );
    await expect(
      chatJsonCompletion([{ role: 'user', content: 'x' }], {
        apiKey: 'sk',
        model: 'deepseek-v4-flash',
      }),
    ).rejects.toMatchObject({ code: 'EMPTY' });
  });

  it('wraps network failures without leaking the key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    await expect(
      chatJsonCompletion([{ role: 'user', content: 'x' }], {
        apiKey: 'sk-secret',
        model: 'deepseek-v4-flash',
      }),
    ).rejects.toMatchObject({ code: 'NETWORK' });
    const error = await chatJsonCompletion(
      [{ role: 'user', content: 'x' }],
      { apiKey: 'sk-secret', model: 'deepseek-v4-flash' },
    ).catch((cause: unknown) => cause);
    expect(error instanceof LlmRequestError).toBe(true);
    expect((error as LlmRequestError).message).not.toContain('sk-secret');
  });
});
