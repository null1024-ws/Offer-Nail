import { useState } from 'react';
import {
  DEFAULT_LLM_MODEL,
  LLM_MODEL_CHOICES,
  type LlmConfig,
  type LlmConfigStore,
} from '../../llm';

export interface LlmSettingsProps {
  store: LlmConfigStore;
  config?: LlmConfig;
  hasApiKey: boolean;
  onSaved: (config: LlmConfig, hasApiKey: boolean) => void;
}

export function LlmSettings({
  store,
  config,
  hasApiKey,
  onSaved,
}: LlmSettingsProps) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [model, setModel] = useState(config?.model ?? DEFAULT_LLM_MODEL);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  const save = async () => {
    setBusy(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const next: LlmConfig = { enabled, model: model.trim() || DEFAULT_LLM_MODEL };
      await store.write(next, apiKey.trim() === '' ? undefined : apiKey);
      setApiKey('');
      onSaved(next, apiKey.trim() !== '' ? true : hasApiKey);
      setMessage('已保存。');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '保存失败。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="llm-settings" aria-labelledby="llm-settings-title">
      <h2 id="llm-settings-title">AI 辅助识别（可选）</h2>
      <p>
        规则解析之外，可用 DeepSeek
        大模型辅助提取技能、语言、项目、论文等更丰富的字段。你需自行提供 API
        Key。
      </p>

      <label className="inline-check">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        启用 AI 辅助识别
      </label>

      {enabled && (
        <div className="llm-form">
          <label>
            模型
            <select value={model} onChange={(event) => setModel(event.target.value)}>
              {LLM_MODEL_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice}
                </option>
              ))}
            </select>
          </label>
          <label>
            API Key
            <input
              type="password"
              value={apiKey}
              placeholder={
                hasApiKey ? '已保存（输入新值以替换）' : 'sk-…'
              }
              autoComplete="off"
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <p className="hint">
            启用后，导入简历时会把简历文本发送到 DeepSeek
            进行识别。识别结果与本地规则解析合并后直接填入档案，你可再编辑或删除。
          </p>
          <div className="actions">
            <button type="button" onClick={save} disabled={busy}>
              {busy ? '保存中…' : '保存'}
            </button>
            {hasApiKey && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError(undefined);
                  try {
                    await store.write({ enabled, model }, '');
                    setApiKey('');
                    onSaved({ enabled, model }, false);
                    setMessage('API Key 已清除。');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                清除 API Key
              </button>
            )}
          </div>
          {message && <p className="ok">{message}</p>}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
