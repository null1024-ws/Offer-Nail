import { useState, type FormEvent } from 'react';

export function Unlock({
  onUnlock,
}: {
  onUnlock: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);
    try {
      await onUnlock(password);
      setPassword('');
    } catch {
      setError('主密码错误或保险库已损坏');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">Offer-Nail</p>
      <h1>解锁本地简历</h1>
      <form onSubmit={submit}>
        <label>
          主密码
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button disabled={submitting || !password} type="submit">
          {submitting ? '正在解锁…' : '解锁'}
        </button>
      </form>
    </main>
  );
}
