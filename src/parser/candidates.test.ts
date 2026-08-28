import { describe, expect, it } from 'vitest';
import { parseResumeCandidates } from './candidates';
import { resumeTextFixture } from './__fixtures__/resume-text';
import { sourceLinesFromText } from './source';

function parseFixture() {
  return parseResumeCandidates(sourceLinesFromText(resumeTextFixture));
}

function values(fieldId: string, result = parseFixture()) {
  return result.candidates
    .filter((item) => item.fieldId === fieldId)
    .map((item) => item.value);
}

describe('parseResumeCandidates', () => {
  it('returns a stable candidate set for the fixed resume fixture', () => {
    const first = parseFixture();
    const second = parseFixture();
    expect(first).toEqual(second);
    expect(values('personal.fullName', first)).toEqual([
      { kind: 'text', value: '张三' },
    ]);
    expect(values('personal.phone', first)).toEqual([
      { kind: 'text', value: '13800138000' },
    ]);
    expect(values('personal.email', first)).toEqual([
      { kind: 'text', value: 'zhangsan@example.com' },
    ]);
    expect(values('personal.github', first)).toEqual([
      { kind: 'url', value: 'https://github.com/zhangsan' },
    ]);
    expect(values('personal.currentCity', first)).toEqual([
      { kind: 'text', value: '北京' },
    ]);
    expect(values('education.school', first)).toEqual([
      { kind: 'text', value: '清华大学' },
    ]);
    expect(values('education.major', first)).toEqual([
      { kind: 'text', value: '计算机科学与技术' },
    ]);
    expect(values('education.educationLevel', first)).toEqual([
      { kind: 'text', value: '本科' },
    ]);
    expect(values('education.gpa', first)).toEqual([
      { kind: 'number', value: 3.8 },
    ]);
    expect(values('education.dateRange', first)).toEqual([
      {
        kind: 'dateRange',
        value: {
          start: { precision: 'month', year: 2019, month: 9 },
          end: { precision: 'month', year: 2023, month: 6 },
          ongoing: false,
        },
      },
    ]);
    expect(values('employment.company', first)).toEqual([
      { kind: 'text', value: '示例科技有限公司' },
    ]);
    expect(values('employment.position', first)).toEqual([
      { kind: 'text', value: '前端实习生' },
    ]);
    expect(values('employment.dateRange', first)).toEqual([
      {
        kind: 'dateRange',
        value: {
          start: { precision: 'month', year: 2025, month: 6 },
          end: { precision: 'month', year: 2025, month: 9 },
          ongoing: false,
        },
      },
    ]);
    expect(values('project.name', first)).toEqual([
      { kind: 'text', value: 'Offer-Nail' },
    ]);
    expect(values('project.url', first)).toEqual([
      { kind: 'url', value: 'https://github.com/example/offer-nail' },
    ]);
    expect(values('project.dateRange', first)).toEqual([
      {
        kind: 'dateRange',
        value: {
          start: { precision: 'month', year: 2026, month: 8 },
          ongoing: true,
        },
      },
    ]);
  });

  it('does not copy the same text into mutually exclusive fields', () => {
    const result = parseFixture();
    const emails = result.candidates.filter(
      (item) => item.source.text === 'zhangsan@example.com',
    );
    expect(emails).toHaveLength(1);
    expect(emails[0]?.fieldId).toBe('personal.email');

    expect(values('employment.company', result)).toEqual([
      { kind: 'text', value: '示例科技有限公司' },
    ]);
    expect(
      result.candidates.some(
        (item) =>
          item.fieldId === 'employment.company' &&
          item.source.text.includes('清华大学'),
      ),
    ).toBe(false);
    expect(
      result.candidates.some(
        (item) =>
          item.fieldId === 'education.school' &&
          item.source.text.includes('示例科技'),
      ),
    ).toBe(false);
    expect(
      result.candidates.filter((item) => item.fieldId === 'personal.github'),
    ).toHaveLength(1);
    expect(
      result.candidates.filter((item) => item.fieldId === 'project.url'),
    ).toHaveLength(1);
  });

  it('keeps unidentified text unmapped instead of guessing', () => {
    const result = parseFixture();
    expect(result.unmapped.map((line) => line.text)).toContain(
      '这是一段无法归类的随手笔记',
    );
    expect(
      result.candidates.some((item) =>
        String('value' in item.value ? item.value.value : '').includes(
          '随手笔记',
        ),
      ),
    ).toBe(false);
    expect(values('personal.gender', result)).toEqual([]);
    expect(values('personal.birthDate', result)).toEqual([]);
    expect(values('jobPreference.position', result)).toEqual([]);
  });

  it('keeps double-digit months intact in date ranges', () => {
    const result = parseResumeCandidates(
      sourceLinesFromText(
        ['教育经历', '示例大学', '2025.11 — 至今'].join('\n'),
      ),
    );
    expect(values('education.dateRange', result)).toEqual([
      {
        kind: 'dateRange',
        value: {
          start: { precision: 'month', year: 2025, month: 11 },
          ongoing: true,
        },
      },
    ]);
  });

  it('keeps October and December months intact', () => {
    const result = parseResumeCandidates(
      sourceLinesFromText(
        ['实习经历', '示例公司', '2021.10 — 2022.12'].join('\n'),
      ),
    );
    expect(values('employment.dateRange', result)).toEqual([
      {
        kind: 'dateRange',
        value: {
          start: { precision: 'month', year: 2021, month: 10 },
          end: { precision: 'month', year: 2022, month: 12 },
          ongoing: false,
        },
      },
    ]);
  });

  it('routes research projects and awards to their own sections, not employment', () => {
    const result = parseResumeCandidates(
      sourceLinesFromText(
        [
          '工作经历',
          '示例公司',
          '软件工程师 2021.01 — 2022.01',
          '研究经历',
          '某研究项目',
          '获奖情况',
          '优秀学生奖学金',
        ].join('\n'),
      ),
    );
    expect(values('employment.company', result)).toEqual([
      { kind: 'text', value: '示例公司' },
    ]);
    expect(values('project.name', result)).toEqual([
      { kind: 'text', value: '某研究项目' },
    ]);
    expect(values('award.name', result)).toEqual([
      { kind: 'text', value: '优秀学生奖学金' },
    ]);
    expect(
      result.candidates.filter((item) => item.fieldId === 'employment.position'),
    ).toEqual([
      expect.objectContaining({ fieldId: 'employment.position' }),
    ]);
  });
});
