import type { FillOutcome } from '../../fill-engine/adapters';

export interface FillResultProps {
  outcomes?: FillOutcome[];
  undoMessage?: string;
  onBack: () => void;
  onUndo: () => void;
}

export function FillResult({
  outcomes = [],
  undoMessage,
  onBack,
  onUndo,
}: FillResultProps) {
  const filled = outcomes.filter((outcome) => outcome.status === 'filled');
  const skipped = outcomes.filter((outcome) => outcome.status === 'skipped');
  const unsupported = outcomes.filter(
    (outcome) => outcome.status === 'unsupported',
  );
  const failed = outcomes.filter((outcome) => outcome.status === 'failed');

  return (
    <section className="fill-result" aria-labelledby="fill-result-title">
      <h2 id="fill-result-title">已直接填写</h2>
      <p>
        高置信且非敏感、页面为空的字段已自动填入；敏感字段与页面已有值的内容不会改动，也不会自动提交。
      </p>
      <ul className="result-stats">
        <li>已填写 {filled.length}</li>
        <li>已跳过 {skipped.length}</li>
        <li>不支持 {unsupported.length}</li>
        <li>失败 {failed.length}</li>
      </ul>
      {outcomes.length > 0 && (
        <ul className="import-list">
          {outcomes.map((outcome, index) => (
            <li key={`${outcome.fingerprint}:${index}`}>
              {statusLabel(outcome.status)}
              {outcome.reason ? `：${outcome.reason}` : ''}
            </li>
          ))}
        </ul>
      )}
      <div className="item-actions">
        {filled.length > 0 && (
          <button type="button" onClick={onUndo}>
            撤销本次填写
          </button>
        )}
        <button type="button" onClick={onBack}>
          返回
        </button>
      </div>
      {undoMessage && <p role="status">{undoMessage}</p>}
    </section>
  );
}

function statusLabel(status: FillOutcome['status']): string {
  if (status === 'filled') return '已填写';
  if (status === 'skipped') return '已跳过';
  if (status === 'unsupported') return '不支持';
  return '失败';
}
