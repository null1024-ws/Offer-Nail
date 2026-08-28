export const ALLOWED_PERMISSIONS = [
  'activeTab',
  'scripting',
  'storage',
] as const;

export const ALLOWED_HOST_PERMISSIONS = ['https://api.deepseek.com/*'] as const;

export const ALLOWED_CONNECT_SRC = ['https://api.deepseek.com'] as const;

export const FORBIDDEN_PERMISSIONS = [
  '<all_urls>',
  'tabs',
  'webRequest',
  'webRequestBlocking',
  'debugger',
  'cookies',
  'history',
  'downloads',
  'identity',
  'geolocation',
  'clipboardRead',
] as const;

export const ALLOWED_RUNTIME_DEPENDENCIES = [
  '@hookform/resolvers',
  'idb',
  'mammoth',
  'pdfjs-dist',
  'react',
  'react-dom',
  'react-hook-form',
  'tesseract.js',
  'zod',
] as const;

export const FORBIDDEN_DEPENDENCY_HINTS = [
  'sentry',
  'telemetry',
  'analytics',
  'openai',
  'posthog',
  'mixpanel',
  'amplitude',
  'firebase',
  'supabase',
] as const;

export const ALLOWED_CONTENT_SCRIPT_MATCHES = [
  'http://127.0.0.1/*',
  'http://localhost/*',
] as const;

// 只有 LLM 辅助识别（用户显式启用并提供 API Key 后）会向这些来源发起请求。
// 其余生产代码一律禁止网络调用。
export const ALLOWED_NETWORK_FILES = ['src/llm/deepseek.ts'] as const;
