export const ALLOWED_PERMISSIONS = [
  'activeTab',
  'scripting',
  'storage',
] as const;

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
