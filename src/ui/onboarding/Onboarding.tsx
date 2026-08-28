import { useState, type FormEvent } from 'react';
import { masterPasswordError } from '../../vault/initialize';

export interface OnboardingProps {
  onInitialize: (input: {
    password: string;
    profileName: string;
  }) => Promise<void>;
}

export function Onboarding({ onInitialize }: OnboardingProps) {
  const [profileName, setProfileName] = useState('默认档案');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const strengthError = masterPasswordError(password);
    if (strengthError) return setError(strengthError);
    if (password !== confirmation) return setError('两次输入的主密码不一致');
    if (!accepted) return setError('请先确认主密码遗失风险');

    setSubmitting(true);
    setError(undefined);
    try {
      await onInitialize({ password, profileName: profileName.trim() });
      setPassword('');
      setConfirmation('');
    } catch {
      setError('初始化失败，请重试；现有数据未被修改');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">Offer-Nail</p>
      <h1>建立你的本地简历保险库</h1>
      <p className="lead">
        简历只在此设备中解析和加密保存。Offer-Nail
        不创建账号，也不会上传你的简历。
      </p>

      <form onSubmit={submit} noValidate>
        <label>
          档案名称
          <input
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            required
          />
        </label>
        <label>
          主密码
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby="password-help"
            required
          />
        </label>
        <p id="password-help" className="hint">
          至少 12 个字符，同时包含字母和数字。主密码不会被保存。
        </p>
        <label>
          再次输入主密码
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </label>
        <label className="acknowledgement">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(event) => setAccepted(event.target.checked)}
          />
          <span>
            我知道主密码无法找回；遗忘后只能清除本地数据并重新建立档案。
          </span>
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button type="submit" disabled={submitting || !profileName.trim()}>
          {submitting ? '正在创建…' : '创建空白档案'}
        </button>
      </form>
    </main>
  );
}
