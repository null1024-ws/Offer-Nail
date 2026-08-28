import { useMemo, useState } from 'react';
import { type ResumeFieldId } from '../../domain/resume/field-catalog';
import type { ResumeData } from '../../domain/resume/schema';
import type { FillOutcome } from '../../fill-engine/adapters';
import {
  retargetPreviewItem,
  type FillPreviewItem,
} from '../../fill-engine/preview';

export interface FillPreviewProps {
  resume: ResumeData;
  items: FillPreviewItem[];
  onConfirm: (selected: FillPreviewItem[]) => void;
  onCancel: () => void;
  outcomes?: FillOutcome[];
  onUndo?: () => void;
  undoMessage?: string;
}

export function FillPreview({
  resume,
  items,
  onConfirm,
  onCancel,
  outcomes,
  onUndo,
  undoMessage,
}: FillPreviewProps) {
  const initial = useMemo(() => items, [items]);
  const [rows, setRows] = useState(initial);

  function update(index: number, patch: Partial<FillPreviewItem>) {
    setRows((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <section className="fill-preview" aria-labelledby="fill-preview-title">
      <h2 id="fill-preview-title">填写预览</h2>
      <p>
        确认前不会改动页面。高置信且非敏感、页面为空的字段默认选中；冲突和敏感项需手动勾选。
      </p>
      <ul className="import-list">
        {rows.map((item, index) => (
          <li key={item.sourceId}>
            {item.unsupported ? (
              <p>
                {item.pageLabel}：{item.reasons[0] ?? item.unsupported}
              </p>
            ) : (
              <>
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={item.selected}
                    onChange={(event) =>
                      update(index, { selected: event.target.checked })
                    }
                  />
                  填写「{item.pageLabel}」
                </label>
                <p className="field-meta">
                  {confidenceLabel(item.confidence)}
                  {item.sensitive ? ' · 敏感' : ''}
                  {item.conflict ? ' · 页面已有值' : ''}
                </p>
                {item.mappingOptions.length > 0 && (
                  <label>
                    档案字段
                    <select
                      aria-label={`${item.pageLabel}的档案字段`}
                      value={item.fieldId ?? ''}
                      onChange={(event) => {
                        const fieldId = event.target.value as ResumeFieldId;
                        if (!fieldId) return;
                        setRows((current) =>
                          current.map((row, rowIndex) =>
                            rowIndex === index
                              ? retargetPreviewItem(row, fieldId, resume)
                              : row,
                          ),
                        );
                      }}
                    >
                      {item.mappingOptions.map((option) => (
                        <option key={option.fieldId} value={option.fieldId}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <p>拟填：{item.proposedValue || '（档案中无值）'}</p>
                {item.conflict && <p>页面已有：{item.pageValue}</p>}
                <p className="field-meta">{item.reasons[0]}</p>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="item-actions">
        <button type="button" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          onClick={() => onConfirm(rows.filter((item) => item.selected))}
        >
          确认填写
        </button>
      </div>
      {outcomes && outcomes.length > 0 && (
        <section aria-labelledby="fill-result-title">
          <h3 id="fill-result-title">本次填写结果</h3>
          <ul className="import-list">
            {outcomes.map((outcome, index) => (
              <li key={`${outcome.fingerprint}:${index}`}>
                {statusLabel(outcome.status)}
                {outcome.reason ? `：${outcome.reason}` : ''}
              </li>
            ))}
          </ul>
          {onUndo && (
            <button type="button" onClick={onUndo}>
              撤销本次填写
            </button>
          )}
          {undoMessage && <p>{undoMessage}</p>}
        </section>
      )}
    </section>
  );
}

function confidenceLabel(confidence: FillPreviewItem['confidence']): string {
  if (confidence === 'high') return '高置信';
  if (confidence === 'medium') return '中置信，需确认';
  if (confidence === 'low') return '低置信，需确认';
  return '未映射';
}

function statusLabel(status: FillOutcome['status']): string {
  if (status === 'filled') return '已填写';
  if (status === 'skipped') return '已跳过';
  if (status === 'unsupported') return '不支持';
  return '失败';
}
