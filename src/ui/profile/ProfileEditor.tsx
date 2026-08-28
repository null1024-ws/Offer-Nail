import { zodResolver } from '@hookform/resolvers/zod';
import {
  FormProvider,
  useFieldArray,
  useForm,
  useFormContext,
  useWatch,
  type FieldPath,
} from 'react-hook-form';
import {
  createDraftRecord,
  profileDraftSchema,
  repeatSectionDefinitions,
  singletonSectionDefinitions,
  type DraftRecord,
  type ProfileDraft,
  type RepeatProperty,
} from '../../domain/resume/editor-model';
import {
  fieldCatalog,
  type ResumeFieldId,
  type ResumeSection,
} from '../../domain/resume/field-catalog';

export interface ProfileEditorProps {
  initialValue: ProfileDraft;
  onSave: (value: ProfileDraft) => Promise<void>;
}

export function ProfileEditor({ initialValue, onSave }: ProfileEditorProps) {
  const methods = useForm<ProfileDraft>({
    defaultValues: initialValue,
    resolver: zodResolver(profileDraftSchema),
  });
  const {
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitSuccessful },
    getValues,
    setValue,
  } = methods;
  const enabledSensitiveSections = useWatch({
    control: methods.control,
    name: 'enabledSensitiveSections',
  });
  const refereesEnabled = enabledSensitiveSections.includes('referees');
  const complianceEnabled = enabledSensitiveSections.includes('compliance');

  function toggleSensitiveCategory(
    category: 'referees' | 'compliance',
    enabled: boolean,
  ) {
    const label = category === 'referees' ? '推荐人' : '招聘合规';
    if (!enabled) {
      if (
        !window.confirm(
          `${label}类别包含敏感或高度敏感信息。确认启用后，这一类别才会保存并参与后续填写预览。是否启用？`,
        )
      ) {
        return;
      }
      setValue('enabledSensitiveSections', [
        ...getValues('enabledSensitiveSections'),
        category,
      ]);
      return;
    }
    if (
      window.confirm(
        `关闭${label}类别会永久删除其中已保存的全部值。此操作将在保存档案后生效，是否继续？`,
      )
    ) {
      setValue(
        'enabledSensitiveSections',
        getValues('enabledSensitiveSections').filter(
          (section) => section !== category,
        ),
      );
      if (category === 'referees') setValue('referees', []);
      if (category === 'compliance') {
        setValue(
          'compliance',
          createDraftRecord('compliance', getValues('compliance.recordId')),
        );
      }
    }
  }

  return (
    <main>
      <p className="eyebrow">Offer-Nail</p>
      <h1>完善主档案</h1>
      <p className="lead">
        普通字段默认允许自动填写；带“敏感”标记的字段默认需要你在每次填写前确认。
      </p>
      <FormProvider {...methods}>
        <form
          className="profile-form"
          onSubmit={handleSubmit(onSave)}
          noValidate
        >
          {singletonSectionDefinitions
            .filter(({ property }) => property !== 'compliance')
            .map(({ property, section, label }) => (
              <SingletonSection
                key={property}
                property={property}
                section={section}
                label={label}
                record={initialValue[property]}
              />
            ))}
          <section className="sensitive-section" id="profile-compliance">
            <header>
              <div>
                <h2>招聘合规与声明</h2>
                <small>敏感类别，默认关闭</small>
              </div>
              <button
                type="button"
                onClick={() =>
                  toggleSensitiveCategory('compliance', complianceEnabled)
                }
              >
                {complianceEnabled
                  ? '关闭并删除招聘合规数据'
                  : '启用招聘合规类别'}
              </button>
            </header>
            {!complianceEnabled && (
              <p>此类别未启用，不会保存或提供任何招聘合规字段用于填写。</p>
            )}
          </section>
          {complianceEnabled && (
            <SingletonSection
              property="compliance"
              section="compliance"
              label="招聘合规字段"
              record={initialValue.compliance}
            />
          )}
          {repeatSectionDefinitions
            .filter(({ property }) => property !== 'referees')
            .map((definition) => (
              <RepeatSection key={definition.property} {...definition} />
            ))}
          <section className="sensitive-section" id="profile-referee">
            <header>
              <div>
                <h2>推荐人/证明人</h2>
                <small>高度敏感，默认关闭</small>
              </div>
              <button
                type="button"
                onClick={() =>
                  toggleSensitiveCategory('referees', refereesEnabled)
                }
              >
                {refereesEnabled ? '关闭并删除推荐人数据' : '启用推荐人类别'}
              </button>
            </header>
            {!refereesEnabled && (
              <p>此类别未启用，不会保存或提供任何推荐人字段用于填写。</p>
            )}
          </section>
          {refereesEnabled && (
            <RepeatSection
              property="referees"
              section="referee"
              label="推荐人/证明人"
            />
          )}
          {Object.keys(errors).length > 0 && (
            <p className="error" role="alert">
              部分字段格式不正确，请检查输入的邮箱、网址、数字、日期和附件。
            </p>
          )}
          {isSubmitSuccessful && <p role="status">档案已加密保存。</p>}
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? '正在保存…' : '保存主档案'}
          </button>
        </form>
      </FormProvider>
    </main>
  );
}

function SingletonSection({
  property,
  section,
  label,
  record,
}: {
  property: 'personal' | 'jobPreference' | 'compliance';
  section: ResumeSection;
  label: string;
  record: DraftRecord;
}) {
  const { register } = useFormContext<ProfileDraft>();
  return (
    <section id={`profile-${section}`}>
      <h2>{label}</h2>
      <input
        type="hidden"
        {...register(`${property}.recordId` as FieldPath<ProfileDraft>)}
      />
      <div className="field-grid">
        {record.fields.map((field, index) => (
          <FieldEditor
            key={field.fieldId}
            fieldId={field.fieldId as ResumeFieldId}
            path={`${property}.fields.${index}`}
            section={section}
          />
        ))}
      </div>
    </section>
  );
}

function RepeatSection({
  property,
  section,
  label,
}: {
  property: RepeatProperty;
  section: ResumeSection;
  label: string;
}) {
  const { control, register } = useFormContext<ProfileDraft>();
  const records = useFieldArray({ control, name: property });
  return (
    <section id={`profile-${section}`}>
      <header>
        <h2>{label}</h2>
        <button
          type="button"
          onClick={() => records.append(createDraftRecord(section))}
        >
          添加{label}
        </button>
      </header>
      {records.fields.map((record, recordIndex) => (
        <article key={record.id}>
          <input
            type="hidden"
            {...register(
              `${property}.${recordIndex}.recordId` as FieldPath<ProfileDraft>,
            )}
          />
          <div className="field-grid">
            {record.fields.map((field, fieldIndex) => (
              <FieldEditor
                key={field.fieldId}
                fieldId={field.fieldId as ResumeFieldId}
                path={`${property}.${recordIndex}.fields.${fieldIndex}`}
                section={section}
              />
            ))}
          </div>
          <ItemActions
            index={recordIndex}
            length={records.fields.length}
            move={records.move}
            remove={records.remove}
          />
        </article>
      ))}
    </section>
  );
}

function FieldEditor({
  fieldId,
  path,
  section,
}: {
  fieldId: ResumeFieldId;
  path: string;
  section: ResumeSection;
}) {
  const { register, setValue } = useFormContext<ProfileDraft>();
  const definition = fieldCatalog[fieldId];
  const fieldPath = (name: 'fieldId' | 'value' | 'start' | 'end') =>
    `${path}.${name}` as FieldPath<ProfileDraft>;
  const longText =
    definition.kind === 'stringList' ||
    /描述|简介|摘要|职责|成果|内容|课程|优势/.test(definition.label);
  const sensitivity =
    definition.sensitivity === 'highlySensitive'
      ? '高度敏感'
      : definition.sensitivity === 'sensitive'
        ? '敏感'
        : undefined;
  return (
    <>
      <input type="hidden" {...register(fieldPath('fieldId'))} />
      {definition.kind === 'dateRange' ? (
        <input type="hidden" {...register(fieldPath('value'))} />
      ) : (
        <>
          <input type="hidden" {...register(fieldPath('start'))} />
          <input type="hidden" {...register(fieldPath('end'))} />
        </>
      )}
      <label className={longText ? 'full-width' : undefined}>
        <span>
          {definition.label} {sensitivity && <small>{sensitivity}</small>}
        </span>
        {definition.kind === 'dateRange' ? (
          <span className="date-range">
            <input
              aria-label={`${definition.label}开始时间`}
              placeholder="YYYY-MM"
              {...register(fieldPath('start'))}
            />
            <input
              aria-label={`${definition.label}结束时间`}
              placeholder="留空表示至今"
              {...register(fieldPath('end'))}
            />
          </span>
        ) : definition.kind === 'boolean' ? (
          <select {...register(fieldPath('value'))}>
            <option value="">未填写</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        ) : definition.kind === 'attachment' ? (
          <>
            <input
              readOnly
              placeholder="当前未关联本地附件"
              {...register(fieldPath('value'))}
            />
            <span className="field-meta">
              当前编辑器不支持新增上传；可保留或清除已有本地附件关联。
            </span>
            <button
              type="button"
              onClick={() => setValue(fieldPath('value'), '')}
            >
              清除{definition.label}
            </button>
          </>
        ) : longText ? (
          <textarea
            rows={definition.kind === 'stringList' ? 3 : 4}
            placeholder={
              definition.kind === 'stringList' ? '每行填写一项' : undefined
            }
            {...register(fieldPath('value'))}
          />
        ) : (
          <input
            inputMode={definition.kind === 'number' ? 'decimal' : undefined}
            type={definition.kind === 'url' ? 'url' : 'text'}
            placeholder={
              definition.kind === 'date'
                ? 'YYYY、YYYY-MM 或 YYYY-MM-DD'
                : undefined
            }
            {...register(fieldPath('value'))}
          />
        )}
        <span className="field-meta">
          {definition.kind === 'stringList' ? '多项，每行一项' : section}
          {' · '}
          {sensitivity ? '每次填写前确认' : '允许自动填写'}
        </span>
      </label>
    </>
  );
}

function ItemActions({
  index,
  length,
  move,
  remove,
}: {
  index: number;
  length: number;
  move: (from: number, to: number) => void;
  remove: (index: number) => void;
}) {
  return (
    <div className="item-actions">
      <button
        type="button"
        disabled={index === 0}
        onClick={() => move(index, index - 1)}
      >
        上移
      </button>
      <button
        type="button"
        disabled={index === length - 1}
        onClick={() => move(index, index + 1)}
      >
        下移
      </button>
      <button type="button" onClick={() => remove(index)}>
        删除
      </button>
    </div>
  );
}
