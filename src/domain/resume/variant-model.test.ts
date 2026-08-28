import { describe, expect, it } from 'vitest';
import { createEmptyResumeData } from './factory';
import {
  clearVariantFieldOverride,
  copyProfileVariant,
  createProfileVariant,
  deleteProfileVariant,
  pruneVariantReferences,
  renameProfileVariant,
  resolveVariantField,
  resolveVariantRecordOrder,
  setVariantFieldOverride,
  setVariantRecordOrder,
} from './variant-model';
import type { ResumeData } from './schema';

function withSummary(source: ResumeData, value: string): ResumeData {
  const data = structuredClone(source);
  data.masterProfile.personal.fields = [
    {
      fieldId: 'personal.summary',
      value: { kind: 'text', value },
      fillPolicy: 'automatic',
    },
    {
      fieldId: 'personal.fullName',
      value: { kind: 'text', value: '张三' },
      fillPolicy: 'automatic',
    },
  ];
  return data;
}

function withSkills(source: ResumeData, names: string[]): ResumeData {
  const data = structuredClone(source);
  data.masterProfile.skills = names.map((name) => ({
    id: crypto.randomUUID(),
    section: 'skill' as const,
    fields: [
      {
        fieldId: 'skill.name',
        value: { kind: 'text', value: name },
        fillPolicy: 'automatic',
      },
    ],
  }));
  return data;
}

describe('profile variants', () => {
  it('creates, renames, copies, and deletes variants without storing master copies', () => {
    const created = createProfileVariant(
      withSummary(createEmptyResumeData(), '通用简介'),
      '前端开发',
    );
    expect(created.profileVariants).toHaveLength(1);
    expect(created.profileVariants[0]!.fieldOverrides).toEqual([]);

    const renamed = renameProfileVariant(
      created,
      created.profileVariants[0]!.id,
      '前端校招',
    );
    expect(renamed.profileVariants[0]!.name).toBe('前端校招');

    const copied = copyProfileVariant(
      renamed,
      renamed.profileVariants[0]!.id,
      '产品经理',
    );
    expect(copied.profileVariants.map((item) => item.name)).toEqual([
      '前端校招',
      '产品经理',
    ]);
    expect(copied.profileVariants[0]!.id).not.toBe(
      copied.profileVariants[1]!.id,
    );

    const deleted = deleteProfileVariant(copied, copied.profileVariants[0]!.id);
    expect(deleted.profileVariants.map((item) => item.name)).toEqual([
      '产品经理',
    ]);
  });

  it('propagates master changes to inherited fields and keeps overrides stable', () => {
    let data = createProfileVariant(
      withSummary(createEmptyResumeData(), '通用简介'),
      '前端开发',
    );
    const variantId = data.profileVariants[0]!.id;
    const recordId = data.masterProfile.personal.id;

    expect(
      resolveVariantField(data, variantId, recordId, 'personal.summary'),
    ).toEqual({
      value: { kind: 'text', value: '通用简介' },
      inherited: true,
    });

    data.masterProfile.personal.fields[0]!.value = {
      kind: 'text',
      value: '更新后的主档案简介',
    };
    expect(
      resolveVariantField(data, variantId, recordId, 'personal.summary'),
    ).toEqual({
      value: { kind: 'text', value: '更新后的主档案简介' },
      inherited: true,
    });

    data = setVariantFieldOverride(
      data,
      variantId,
      recordId,
      'personal.summary',
      {
        kind: 'text',
        value: '前端向简介',
      },
    );
    data.masterProfile.personal.fields[0]!.value = {
      kind: 'text',
      value: '再次更新的主档案简介',
    };
    expect(
      resolveVariantField(data, variantId, recordId, 'personal.summary'),
    ).toEqual({
      value: { kind: 'text', value: '前端向简介' },
      inherited: false,
    });

    data = clearVariantFieldOverride(
      data,
      variantId,
      recordId,
      'personal.summary',
    );
    expect(
      resolveVariantField(data, variantId, recordId, 'personal.summary'),
    ).toEqual({
      value: { kind: 'text', value: '再次更新的主档案简介' },
      inherited: true,
    });
  });

  it('rejects identity field overrides and prunes stale references after master deletes', () => {
    let data = createProfileVariant(
      withSummary(createEmptyResumeData(), '通用简介'),
      '前端开发',
    );
    const variantId = data.profileVariants[0]!.id;
    const personalId = data.masterProfile.personal.id;

    expect(() =>
      setVariantFieldOverride(
        data,
        variantId,
        personalId,
        'personal.fullName',
        {
          kind: 'text',
          value: '李四',
        },
      ),
    ).toThrow('不允许由岗位变体覆盖');

    data = withSkills(data, ['TypeScript', 'React']);
    const [first, second] = data.masterProfile.skills;
    data = setVariantRecordOrder(data, variantId, 'skill', [
      second!.id,
      first!.id,
    ]);
    expect(
      resolveVariantRecordOrder(data, variantId, 'skill').recordIds,
    ).toEqual([second!.id, first!.id]);

    data.masterProfile.skills = data.masterProfile.skills.filter(
      (record) => record.id !== first!.id,
    );
    const pruned = pruneVariantReferences(data);
    expect(
      resolveVariantRecordOrder(pruned, variantId, 'skill').recordIds,
    ).toEqual([second!.id]);
  });
});
