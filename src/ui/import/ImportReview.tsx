import { useMemo, useState } from 'react';
import { fieldCatalog } from '../../domain/resume/field-catalog';
import {
  dateValueSchema,
  type DateValue,
  type FieldValue,
  type ResumeData,
} from '../../domain/resume/schema';
import type { FieldCandidate } from '../../parser/candidates';
import {
  applyConfirmedCandidates,
  existingFieldValue,
  type CandidateDecision,
} from '../../parser/merge';

export function formatFieldValue(value?: FieldValue): string {
  if (!value) return '';
  if (value.kind === 'attachment') return value.attachmentId;
  if (value.kind === 'date') return formatDate(value.value);
  if (value.kind === 'dateRange') {
    const start = formatDate(value.value.start);
    const end = value.value.ongoing
      ? '至今'
      : value.value.end
        ? formatDate(value.value.end)
        : '';
    return `${start} - ${end}`;
  }
  return Array.isArray(value.value)
    ? value.value.join('\n')
    : String(value.value);
}

function formatDate(value: DateValue): string {
  return [
    String(value.year),
    value.month ? String(value.month).padStart(2, '0') : undefined,
    value.day ? String(value.day).padStart(2, '0') : undefined,
  ]
    .filter(Boolean)
    .join('-');
}

function parseDate(value: string): DateValue | undefined {
  if (!value.trim()) return undefined;
  const parts = value.trim().split('-');
  if (parts.length > 3) return undefined;
  const [year, month, day] = parts.map(Number);
  const parsed = dateValueSchema.safeParse({
    precision:
      parts.length === 1 ? 'year' : parts.length === 2 ? 'month' : 'day',
    year,
    ...(month ? { month } : {}),
    ...(day ? { day } : {}),
  });
  return parsed.success ? parsed.data : undefined;
}

export interface ImportReviewProps {
  resume: ResumeData;
  candidates: FieldCandidate[];
  unmapped: Array<{ id: string; text: string }>;
  onApply: (next: ResumeData) => Promise<void> | void;
  onCancel: () => void;
}

export function ImportReview({
  resume,
  candidates,
  unmapped,
  onApply,
  onCancel,
}: ImportReviewProps) {
  const initial = useMemo(
    () =>
      candidates.map((candidate) => {
        const existing = existingFieldValue(resume, candidate);
        return {
          candidate,
          selected: candidate.confidence === 'high' && !existing,
          overwrite: false,
          value: candidate.value,
        } satisfies CandidateDecision;
      }),
    [candidates, resume],
  );
  const [decisions, setDecisions] = useState<CandidateDecision[]>(initial);
  const [error, setError] = useState<string>();

  function update(index: number, patch: Partial<CandidateDecision>) {
    setDecisions((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  return (
    <section className="import-review" aria-labelledby="import-title">
      <h2 id="import-title">校对导入结果</h2>
      <p>只有勾选的候选会写入主档案。已有值默认保留；如需覆盖，请额外确认。</p>
      <ul className="import-list">
        {decisions.map((decision, index) => {
          const existing = existingFieldValue(resume, decision.candidate);
          const label = fieldCatalog[decision.candidate.fieldId].label;
          return (
            <li
              key={`${decision.candidate.recordKey}:${decision.candidate.fieldId}:${index}`}
            >
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={decision.selected}
                  onChange={(event) =>
                    update(index, { selected: event.target.checked })
                  }
                />
                接受「{label}」
              </label>
              <p className="field-meta">
                {decision.candidate.confidence === 'high' ? '高置信' : '中置信'}
              </p>
              <div className="import-candidate-grid">
                <p>原文：{decision.candidate.source.text}</p>
                <CandidateValueEditor
                  label={label}
                  value={decision.value}
                  onChange={(value) => update(index, { value })}
                />
              </div>
              {existing && (
                <>
                  <p>档案已有：{formatFieldValue(existing)}</p>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      checked={decision.overwrite}
                      onChange={(event) =>
                        update(index, { overwrite: event.target.checked })
                      }
                    />
                    覆盖已有值
                  </label>
                </>
              )}
            </li>
          );
        })}
      </ul>
      {unmapped.length > 0 && (
        <div>
          <h3>未映射文本</h3>
          <ul>
            {unmapped.map((line) => (
              <li key={line.id}>{line.text}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="item-actions">
        <button type="button" onClick={onCancel}>
          取消导入
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              setError(undefined);
              void onApply(applyConfirmedCandidates(resume, decisions));
            } catch (cause) {
              setError(
                cause instanceof Error
                  ? cause.message
                  : '无法写入选中字段，现有档案未改动。',
              );
            }
          }}
        >
          写入选中字段
        </button>
      </div>
    </section>
  );
}

function CandidateValueEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: FieldValue;
  onChange: (value: FieldValue) => void;
}) {
  if (value.kind === 'text') {
    return (
      <label>
        将写入
        <input
          aria-label={`将写入的${label}`}
          type="text"
          value={value.value}
          onChange={(event) =>
            onChange({ kind: 'text', value: event.target.value })
          }
        />
      </label>
    );
  }

  if (value.kind === 'url') {
    return (
      <label>
        将写入
        <input
          aria-label={`将写入的${label}`}
          type="url"
          value={value.value}
          onChange={(event) =>
            onChange({ kind: 'url', value: event.target.value })
          }
        />
      </label>
    );
  }

  if (value.kind === 'number') {
    return (
      <label>
        将写入
        <input
          aria-label={`将写入的${label}`}
          inputMode="decimal"
          type="number"
          value={value.value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next))
              onChange({ kind: 'number', value: next });
          }}
        />
      </label>
    );
  }

  if (value.kind === 'boolean') {
    return (
      <label>
        将写入
        <select
          aria-label={`将写入的${label}`}
          value={String(value.value)}
          onChange={(event) =>
            onChange({
              kind: 'boolean',
              value: event.target.value === 'true',
            })
          }
        >
          <option value="true">是</option>
          <option value="false">否</option>
        </select>
      </label>
    );
  }

  if (value.kind === 'stringList') {
    return (
      <label>
        将写入
        <textarea
          aria-label={`将写入的${label}`}
          rows={3}
          value={value.value.join('\n')}
          onChange={(event) =>
            onChange({
              kind: 'stringList',
              value: event.target.value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
    );
  }

  if (value.kind === 'date') {
    return (
      <label>
        将写入
        <input
          aria-label={`将写入的${label}`}
          placeholder="YYYY、YYYY-MM 或 YYYY-MM-DD"
          value={formatDate(value.value)}
          onChange={(event) => {
            const next = parseDate(event.target.value);
            if (next) onChange({ kind: 'date', value: next });
          }}
        />
      </label>
    );
  }

  if (value.kind === 'dateRange') {
    return (
      <span className="date-range">
        <label>
          开始时间
          <input
            aria-label={`将写入的${label}开始时间`}
            placeholder="YYYY-MM"
            value={formatDate(value.value.start)}
            onChange={(event) => {
              const start = parseDate(event.target.value);
              if (!start) return;
              onChange({
                kind: 'dateRange',
                value: { ...value.value, start },
              });
            }}
          />
        </label>
        <label>
          结束时间
          <input
            aria-label={`将写入的${label}结束时间`}
            placeholder="留空表示至今"
            value={
              value.value.ongoing
                ? ''
                : value.value.end
                  ? formatDate(value.value.end)
                  : ''
            }
            onChange={(event) => {
              const raw = event.target.value.trim();
              if (!raw || raw === '至今') {
                onChange({
                  kind: 'dateRange',
                  value: {
                    start: value.value.start,
                    ongoing: true,
                  },
                });
                return;
              }
              const end = parseDate(raw);
              if (!end) return;
              onChange({
                kind: 'dateRange',
                value: {
                  start: value.value.start,
                  end,
                  ongoing: false,
                },
              });
            }}
          />
        </label>
      </span>
    );
  }

  return <p>将写入：{formatFieldValue(value)}</p>;
}
