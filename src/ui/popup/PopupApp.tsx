import { useEffect, useState } from 'react';
import { Unlock } from '../onboarding/Unlock';
import { FillPreview } from '../fill/FillPreview';
import type { ResumeData } from '../../domain/resume/schema';
import type { FillOutcome } from '../../fill-engine/adapters';
import type { FillPreviewItem } from '../../fill-engine/preview';
import type {
  ExtensionRequest,
  ExtensionResponse,
} from '../../runtime/protocol';

export interface PopupAppProps {
  sendMessage: (request: ExtensionRequest) => Promise<ExtensionResponse>;
  openOptions: () => void;
}

export function PopupApp({ sendMessage, openOptions }: PopupAppProps) {
  const [status, setStatus] = useState<
    'loading' | 'uninitialized' | 'locked' | 'ready' | 'preview'
  >('loading');
  const [profileName, setProfileName] = useState('');
  const [variants, setVariants] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [variantId, setVariantId] = useState('');
  const [resume, setResume] = useState<ResumeData>();
  const [items, setItems] = useState<FillPreviewItem[]>([]);
  const [outcomes, setOutcomes] = useState<FillOutcome[]>();
  const [undoMessage, setUndoMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void sendMessage({ type: 'offerNail:status' }).then((response) => {
      if (!response.ok || !('status' in response)) {
        setStatus('locked');
        return;
      }
      if (response.status === 'unlocked') {
        setProfileName(response.profileName ?? '');
        setVariants(response.variants ?? []);
        setStatus('ready');
        return;
      }
      setStatus(response.status);
    });
  }, [sendMessage]);

  if (status === 'loading') {
    return (
      <main>
        <p className="eyebrow">Offer-Nail</p>
        <h1>正在检查本地保险库…</h1>
      </main>
    );
  }

  if (status === 'uninitialized') {
    return (
      <main>
        <p className="eyebrow">Offer-Nail</p>
        <h1>先建立本地档案</h1>
        <p>填写前需要在设置页创建主密码和简历档案。插件不会自动提交申请。</p>
        <button type="button" onClick={openOptions}>
          打开设置页
        </button>
      </main>
    );
  }

  if (status === 'locked') {
    return (
      <Unlock
        onUnlock={async (password) => {
          const response = await sendMessage({
            type: 'offerNail:unlock',
            password,
          });
          if (!response.ok || !('status' in response)) {
            throw new Error('unlock-failed');
          }
          setProfileName(response.profileName ?? '');
          setVariants(response.variants ?? []);
          setStatus('ready');
        }}
      />
    );
  }

  if (status === 'preview' && resume) {
    return (
      <FillPreview
        resume={resume}
        items={items}
        outcomes={outcomes}
        undoMessage={undoMessage}
        onCancel={() => {
          setOutcomes(undefined);
          setUndoMessage(undefined);
          setStatus('ready');
        }}
        onConfirm={async (selected) => {
          const response = await sendMessage({
            type: 'offerNail:confirmFill',
            items: selected,
          });
          if (!response.ok || !('outcomes' in response)) {
            setError(!response.ok ? response.error : '填写失败');
            return;
          }
          setOutcomes(response.outcomes);
          setUndoMessage(undefined);
        }}
        onUndo={async () => {
          const response = await sendMessage({ type: 'offerNail:undoFill' });
          if (!response.ok || !('undone' in response)) {
            setUndoMessage(!response.ok ? response.error : '撤销失败');
            return;
          }
          setUndoMessage(
            response.undone.ok
              ? '已恢复本次填写前的页面值。'
              : (response.undone.message ?? '无法撤销'),
          );
          if (response.undone.ok) setOutcomes(undefined);
        }}
      />
    );
  }

  return (
    <main>
      <p className="eyebrow">Offer-Nail</p>
      <h1>{profileName || '本地档案'}</h1>
      <p>扫描当前页后面试填写预览。确认前不会改动页面，也永远不会自动提交。</p>
      {variants.length > 0 && (
        <label>
          岗位变体
          <select
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
          >
            <option value="">主档案</option>
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={async () => {
          setError(undefined);
          const response = await sendMessage({
            type: 'offerNail:scan',
            variantId: variantId || undefined,
          });
          if (!response.ok || !('items' in response)) {
            setError(!response.ok ? response.error : '扫描失败');
            return;
          }
          setResume(response.resume);
          setItems(response.items);
          setOutcomes(undefined);
          setUndoMessage(undefined);
          setStatus('preview');
        }}
      >
        扫描当前页
      </button>
      <button type="button" className="secondary" onClick={openOptions}>
        打开设置页
      </button>
    </main>
  );
}
