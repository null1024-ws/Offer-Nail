import { useEffect, useState } from 'react';
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
  const [confirmReset, setConfirmReset] = useState(false);

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
        <p>填写前需要在设置页创建简历档案。插件不会自动提交申请。</p>
        <div className="actions">
          <button type="button" onClick={openOptions}>
            打开设置页
          </button>
        </div>
      </main>
    );
  }

  if (status === 'locked') {
    return (
      <main>
        <p className="eyebrow">Offer-Nail</p>
        <h1>无法打开现有档案</h1>
        <p>
          本地数据无法自动读取。请打开设置页清除后重新创建，全程不需要密码。
        </p>
        <div className="actions">
          <button type="button" onClick={openOptions}>
            打开设置页
          </button>
        </div>
      </main>
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
      {confirmReset ? (
        <div className="actions">
          <p className="error" role="alert">
            删除档案会清除本地简历、网站规则、岗位变体和本机密钥，无法恢复。
          </p>
          <button
            type="button"
            className="danger"
            onClick={async () => {
              setError(undefined);
              const response = await sendMessage({ type: 'offerNail:reset' });
              if (!response.ok) {
                setError(!response.ok ? response.error : '删除失败');
                return;
              }
              setConfirmReset(false);
              setStatus('uninitialized');
            }}
          >
            确认删除
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setConfirmReset(false)}
          >
            取消
          </button>
        </div>
      ) : (
        <div className="actions">
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
          <button
            type="button"
            className="danger"
            onClick={() => setConfirmReset(true)}
          >
            删除档案
          </button>
        </div>
      )}
    </main>
  );
}
