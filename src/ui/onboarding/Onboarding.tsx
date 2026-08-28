import { useState, type FormEvent } from 'react';

export interface OnboardingProps {
  onInitialize: (input: { profileName: string }) => Promise<void>;
}

export function Onboarding({ onInitialize }: OnboardingProps) {
  const [profileName, setProfileName] = useState('默认档案');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent) {
    event.preventDefault();
    const name = profileName.trim();
    if (!name) return setError('请填写档案名称');

    setSubmitting(true);
    setError(undefined);
    try {
      await onInitialize({ profileName: name });
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
