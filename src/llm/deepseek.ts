export const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export class LlmRequestError extends Error {
  constructor(
    readonly code:
      | 'INVALID_KEY'
      | 'RATE_LIMITED'
      | 'NETWORK'
      | 'SERVER'
      | 'EMPTY',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'LlmRequestError';
  }
}

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatJsonOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export async function chatJsonCompletion(
  messages: ChatMessage[],
  options: ChatJsonOptions,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(
      `${options.baseUrl ?? DEFAULT_DEEPSEEK_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages,
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          max_tokens: options.maxTokens ?? 4096,
          temperature: options.temperature ?? 0,
        }),
      },
    );
  } catch (error) {
    throw new LlmRequestError('NETWORK', '无法连接识别服务，请检查网络。', {
      cause: error,
    });
  }

  if (response.status === 401 || response.status === 403) {
    throw new LlmRequestError(
      'INVALID_KEY',
      'API Key 无效或没有访问权限，请在设置中检查。',
    );
  }
  if (response.status === 429) {
    throw new LlmRequestError(
      'RATE_LIMITED',
      '识别服务请求过于频繁，请稍后再试。',
    );
  }
  if (!response.ok) {
    throw new LlmRequestError(
      'SERVER',
      `识别服务返回错误（${response.status}），请稍后再试。`,
    );
  }

  let data: ChatCompletionResponse;
  try {
    data = (await response.json()) as ChatCompletionResponse;
  } catch (error) {
    throw new LlmRequestError('SERVER', '识别服务返回了无法解析的数据。', {
      cause: error,
    });
  }

  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim() === '') {
    throw new LlmRequestError('EMPTY', '识别服务没有返回内容，请重试。');
  }
  return content;
}
