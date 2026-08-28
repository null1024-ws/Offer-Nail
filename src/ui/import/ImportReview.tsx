import { useMemo, useState } from 'react';
import {
  fieldCatalog,
  type ResumeFieldId,
} from '../../domain/resume/field-catalog';
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

interface CandidateGroup {
  key: string;
  title: string;
  subtitle?: string;
  indices: number[];
}

const SECTION_TITLES: Record<string, string> = {
  personal: '基本信息',
  education: '教育经历',
  employment: '工作经历',
  project: '项目经历',
};

function primaryFieldId(recordKey: string): ResumeFieldId | undefined {
  if (recordKey.startsWith('education')) return 'education.school';
  if (recordKey.startsWith('employment')) return 'employment.company';
  if (recordKey.startsWith('project')) return 'project.name';
  return undefined;
}

function groupCandidates(decisions: CandidateDecision[]): CandidateGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, number[]>();
  decisions.forEach((decision, index) => {
    const key = decision.candidate.recordKey;
    const indices = byKey.get(key);
    if (indices) indices.push(index);
    else {
      byKey.set(key, [index]);
      order.push(key);
    }
  });
  return order.map((key) => {
    const indices = byKey.get(key) ?? [];
    const section = key.split(':')[0] ?? key;
    const ordinal = key.includes(':')
      ? ` ${Number(key.split(':')[1]) + 1}`
      : '';
    const primary = primaryFieldId(key);
    const subtitle = primary
      ? formatFieldValue(
          indices
            .map((index) => decisions[index]?.candidate)
            .find((candidate) => candidate?.fieldId === primary)?.value,
        )
      : undefined;
    return {
      key,
      title: (SECTION_TITLES[section] ?? section) + ordinal,
      subtitle,
      indices,
    };
  });
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
  const groups = useMemo(() => groupCandidates(decisions), [decisions]);

  function update(index: number, patch: Partial<CandidateDecision>) {
    setDecisions((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  }

  function toggleGroup(indices: number[], selected: boolean) {
    setDecisions((current) =>
      current.map((item, itemIndex) =>
        indices.includes(itemIndex) ? { ...item, selected } : item,
      ),
    );
  }

  return (
    <section className="import-review" aria-labelledby="import-title">
      <h2 id="import-title">校对导入结果</h2>
      <p>只有勾选的候选会写入主档案。已有值默认保留；如需覆盖，请额外确认。</p>
      <ul className="import-list">
        {groups.map((group) => {
          const allSelected = group.indices.every(
            (index) => decisions[index]?.selected,
          );
          return (
            <li key={group.key} className="import-group">
              <header className="import-group-head">
                <label className="inline-check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      toggleGroup(group.indices, event.target.checked)
                    }
                  />
                  接受「{group.title}」全部
                </label>
                {group.subtitle && (
                  <p className="field-meta">{group.subtitle}</p>
                )}
              </header>
              <div className="import-group-fields">
                {group.indices.map((index) => {
                  const decision = decisions[index]!;
                  const existing = existingFieldValue(
                    resume,
                    decision.candidate,
                  );
                  const label = fieldCatalog[decision.candidate.fieldId].label;
                  return (
                    <div
                      className="import-field"
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
                        {decision.candidate.confidence === 'high'
                          ? '高置信'
                          : '中置信'}
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
                                update(index, {
                                  overwrite: event.target.checked,
                                })
                              }
                            />
                            覆盖已有值
                          </label>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
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
