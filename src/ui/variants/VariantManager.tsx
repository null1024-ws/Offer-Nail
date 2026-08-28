import { useMemo, useState } from 'react';
import {
  fieldCatalog,
  type ResumeFieldId,
} from '../../domain/resume/field-catalog';
import {
  clearVariantFieldOverride,
  copyProfileVariant,
  createProfileVariant,
  deleteProfileVariant,
  getMasterRecords,
  listOverridableFields,
  renameProfileVariant,
  resolveVariantField,
  resolveVariantRecordOrder,
  setVariantAttachmentIds,
  setVariantFieldOverride,
  setVariantRecordOrder,
  variantOrderSections,
  type FieldValue,
  type ResumeData,
  type ResumeRecord,
} from '../../domain/resume';

export interface VariantManagerProps {
  value: ResumeData;
  onChange: (value: ResumeData) => Promise<void>;
}

function display(value?: FieldValue): string {
  if (!value) return '';
  if (value.kind === 'attachment') return value.attachmentId;
  if (value.kind === 'date') {
    return [value.value.year, value.value.month, value.value.day]
      .filter(Boolean)
      .join('-');
  }
  if (value.kind === 'dateRange') return '';
  return Array.isArray(value.value)
    ? value.value.join('\n')
    : String(value.value);
}

function parse(fieldId: ResumeFieldId, input: string): FieldValue | undefined {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  const kind = fieldCatalog[fieldId].kind;
  if (kind === 'stringList') {
    return {
      kind,
      value: input
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean),
    };
  }
  if (kind === 'number') {
    const value = Number(trimmed);
    if (!Number.isFinite(value)) throw new Error('请输入有效数字');
    return { kind, value };
  }
  if (kind === 'boolean') return { kind, value: trimmed === 'true' };
  if (kind === 'date') {
    const [year, month, day] = trimmed.split('-').map(Number);
    return {
      kind,
      value: {
        precision: day ? 'day' : month ? 'month' : 'year',
        year: year!,
        ...(month ? { month } : {}),
        ...(day ? { day } : {}),
      },
    };
  }
  if (kind === 'url') return { kind, value: trimmed };
  if (kind === 'attachment') return { kind, attachmentId: trimmed };
  if (kind === 'dateRange') throw new Error('时间区间字段不允许覆盖');
  return { kind: 'text', value: input };
}

const recordTitleFields = [
  'skill.name',
  'employment.company',
  'project.name',
  'portfolio.name',
  'research.title',
] as const;

function recordTitle(record: ResumeRecord): string {
  for (const fieldId of recordTitleFields) {
    const entry = record.fields.find((item) => item.fieldId === fieldId);
    if (entry?.value.kind === 'text' && entry.value.value.trim()) {
      return entry.value.value;
    }
  }
  return `未命名${record.section}`;
}

export function VariantManager({ value, onChange }: VariantManagerProps) {
  const [selectedId, setSelectedId] = useState(
    value.profileVariants[0]?.id ?? '',
  );
  const [newName, setNewName] = useState('');
  const [renameDraft, setRenameDraft] = useState<{
    id: string;
    name: string;
  }>();
  const selected =
    value.profileVariants.find(({ id }) => id === selectedId) ??
    value.profileVariants[0];
  const renameValue =
    selected && renameDraft?.id === selected.id
      ? renameDraft.name
      : (selected?.name ?? '');
  const editable = useMemo(() => listOverridableFields(value), [value]);

  async function save(next: ResumeData) {
    await onChange(next);
  }

  return (
    <section className="variant-manager" aria-labelledby="variant-title">
      <h2 id="variant-title">岗位变体</h2>
      <p>
        变体只保存允许覆盖的内容；姓名、学校、公司等身份与事实字段始终继承主档案。删除覆盖后立即恢复主档案当前值。
      </p>
      <div className="variant-create">
        <label>
          新变体名称
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!newName.trim()}
          onClick={async () => {
            const next = createProfileVariant(value, newName);
            setSelectedId(next.profileVariants.at(-1)!.id);
            setNewName('');
            await save(next);
          }}
        >
          创建变体
        </button>
      </div>
      {value.profileVariants.length > 0 && (
        <label>
          当前变体
          <select
            value={selected?.id ?? ''}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {value.profileVariants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <>
          <div className="variant-rename">
            <label>
              变体名称
              <input
                value={renameValue}
                onChange={(event) =>
                  selected &&
                  setRenameDraft({ id: selected.id, name: event.target.value })
                }
              />
            </label>
            <div className="item-actions">
              <button
                type="button"
                disabled={
                  !renameValue.trim() || renameValue.trim() === selected.name
                }
                onClick={() =>
                  save(renameProfileVariant(value, selected.id, renameValue))
                }
              >
                保存名称
              </button>
              <button
                type="button"
                onClick={async () => {
                  const next = copyProfileVariant(value, selected.id);
                  setSelectedId(next.profileVariants.at(-1)!.id);
                  await save(next);
                }}
              >
                复制
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm(`确认删除岗位变体“${selected.name}”？`)) {
                    return;
                  }
                  const next = deleteProfileVariant(value, selected.id);
                  setSelectedId(next.profileVariants[0]?.id ?? '');
                  await save(next);
                }}
              >
                删除
              </button>
            </div>
          </div>
          <div className="variant-fields">
            {editable.map(({ record, fieldId, label }) => {
              const resolved = resolveVariantField(
                value,
                selected.id,
                record.id,
                fieldId,
              );
              const master = record.fields.find(
                (entry) => entry.fieldId === fieldId,
              )?.value;
              const key = `${record.id}:${fieldId}`;
              const kind = fieldCatalog[fieldId].kind;
              return (
                <label key={key} className="variant-field">
                  <span>{label}</span>
                  <small>
                    {resolved.inherited ? '继承主档案' : '当前变体覆盖'}
                  </small>
                  <span className="inherited-value">
                    主档案：{display(master) || '未填写'}
                  </span>
                  {kind === 'boolean' ? (
                    <select
                      aria-label={`${label}变体值`}
                      value={
                        resolved.value?.kind === 'boolean'
                          ? String(resolved.value.value)
                          : ''
                      }
                      onChange={(event) => {
                        const input = event.target.value;
                        const next = input
                          ? setVariantFieldOverride(
                              value,
                              selected.id,
                              record.id,
                              fieldId,
                              { kind: 'boolean', value: input === 'true' },
                            )
                          : clearVariantFieldOverride(
                              value,
                              selected.id,
                              record.id,
                              fieldId,
                            );
                        return save(next);
                      }}
                    >
                      <option value="">继承主档案</option>
                      <option value="true">是</option>
                      <option value="false">否</option>
                    </select>
                  ) : (
                    <textarea
                      aria-label={`${label}变体值`}
                      rows={kind === 'stringList' ? 3 : 2}
                      defaultValue={display(resolved.value)}
                      key={`${selected.id}:${key}:${resolved.inherited}:${display(resolved.value)}`}
                      onBlur={(event) => {
                        try {
                          const parsed = parse(fieldId, event.target.value);
                          const current = display(resolved.value);
                          if (event.target.value === current) return;
                          const next = parsed
                            ? setVariantFieldOverride(
                                value,
                                selected.id,
                                record.id,
                                fieldId,
                                parsed,
                              )
                            : clearVariantFieldOverride(
                                value,
                                selected.id,
                                record.id,
                                fieldId,
                              );
                          return save(next);
                        } catch {
                          event.target.value = display(resolved.value);
                        }
                      }}
                    />
                  )}
                  {!resolved.inherited && (
                    <button
                      type="button"
                      onClick={() =>
                        save(
                          clearVariantFieldOverride(
                            value,
                            selected.id,
                            record.id,
                            fieldId,
                          ),
                        )
                      }
                    >
                      清除覆盖并恢复继承
                    </button>
                  )}
                </label>
              );
            })}
          </div>
          {variantOrderSections.map((section) => {
            const resolved = resolveVariantRecordOrder(
              value,
              selected.id,
              section,
            );
            if (resolved.recordIds.length < 2) return null;
            const byId = new Map(
              getMasterRecords(value)
                .filter((record) => record.section === section)
                .map((record) => [record.id, record]),
            );
            return (
              <div key={section} className="variant-order">
                <strong>
                  {section} 排序
                  {resolved.inherited ? '（继承主档案）' : '（当前变体覆盖）'}
                </strong>
                {resolved.recordIds.map((id, index) => (
                  <div key={id} className="item-actions">
                    <span>{recordTitle(byId.get(id)!)}</span>
                    <button
                      type="button"
                      aria-label={`上移${recordTitle(byId.get(id)!)}`}
                      disabled={index === 0}
                      onClick={() => {
                        const nextOrder = [...resolved.recordIds];
                        [nextOrder[index - 1], nextOrder[index]] = [
                          nextOrder[index]!,
                          nextOrder[index - 1]!,
                        ];
                        return save(
                          setVariantRecordOrder(
                            value,
                            selected.id,
                            section,
                            nextOrder,
                          ),
                        );
                      }}
                    >
                      上移
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          {value.attachments.length > 0 && (
            <fieldset className="variant-attachments">
              <legend>附件选择覆盖</legend>
              {value.attachments.map((attachment) => {
                const checked = selected.attachmentIds.includes(attachment.id);
                return (
                  <label key={attachment.id} className="inline-check">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const nextIds = event.target.checked
                          ? [...selected.attachmentIds, attachment.id]
                          : selected.attachmentIds.filter(
                              (id) => id !== attachment.id,
                            );
                        return save(
                          setVariantAttachmentIds(value, selected.id, nextIds),
                        );
                      }}
                    />
                    {attachment.filename}
                  </label>
                );
              })}
            </fieldset>
          )}
        </>
      )}
    </section>
  );
}
