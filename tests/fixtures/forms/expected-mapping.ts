import {
  isResumeFieldId,
  type ResumeFieldId,
} from '../../../src/domain/resume/field-catalog';

export type FixtureControl =
  | 'text'
  | 'textarea'
  | 'radio'
  | 'checkbox'
  | 'select'
  | 'date'
  | 'controlled'
  | 'repeat'
  | 'shadow';

export type FixtureFillPolicy = 'write' | 'keepExisting' | 'skip';

export type FixtureSkipReason =
  'hidden' | 'disabled' | 'unsupported' | 'submit';

export interface FixtureFieldExpectation {
  testId: string;
  control: FixtureControl | 'action' | 'hidden' | 'disabled' | 'unsupported';
  label: string;
  expectedFieldId: ResumeFieldId | null;
  expectedFill: string;
  fillPolicy: FixtureFillPolicy;
  skipReason?: FixtureSkipReason;
  inOpenShadow?: boolean;
}

export const fixtureFieldExpectations = [
  {
    testId: 'field-full-name',
    control: 'text',
    label: '姓名',
    expectedFieldId: 'personal.fullName',
    expectedFill: '张三',
    fillPolicy: 'write',
  },
  {
    testId: 'field-phone',
    control: 'text',
    label: '手机号码',
    expectedFieldId: 'personal.phone',
    expectedFill: '13800138000',
    fillPolicy: 'write',
  },
  {
    testId: 'field-email',
    control: 'text',
    label: '邮箱地址',
    expectedFieldId: 'personal.email',
    expectedFill: 'already@example.com',
    fillPolicy: 'keepExisting',
  },
  {
    testId: 'field-summary',
    control: 'textarea',
    label: '个人简介',
    expectedFieldId: 'personal.summary',
    expectedFill: '本地优先的简历填写扩展作者。',
    fillPolicy: 'write',
  },
  {
    testId: 'field-gender-male',
    control: 'radio',
    label: '性别',
    expectedFieldId: 'personal.gender',
    expectedFill: '男',
    fillPolicy: 'write',
  },
  {
    testId: 'field-accept-remote',
    control: 'checkbox',
    label: '接受远程',
    expectedFieldId: 'jobPreference.acceptRemote',
    expectedFill: 'true',
    fillPolicy: 'write',
  },
  {
    testId: 'field-education-level',
    control: 'select',
    label: '学历',
    expectedFieldId: 'education.educationLevel',
    expectedFill: '本科',
    fillPolicy: 'write',
  },
  {
    testId: 'field-birth-date',
    control: 'date',
    label: '出生日期',
    expectedFieldId: 'personal.birthDate',
    expectedFill: '1998-06-15',
    fillPolicy: 'write',
  },
  {
    testId: 'field-current-city',
    control: 'controlled',
    label: '所在城市',
    expectedFieldId: 'personal.currentCity',
    expectedFill: '北京',
    fillPolicy: 'write',
  },
  {
    testId: 'field-school',
    control: 'text',
    label: '学校名称',
    expectedFieldId: 'education.school',
    expectedFill: '清华大学',
    fillPolicy: 'write',
  },
  {
    testId: 'employment-0-company',
    control: 'repeat',
    label: '公司名称',
    expectedFieldId: 'employment.company',
    expectedFill: '示例科技有限公司',
    fillPolicy: 'keepExisting',
  },
  {
    testId: 'employment-0-position',
    control: 'repeat',
    label: '职位名称',
    expectedFieldId: 'employment.position',
    expectedFill: '前端实习生',
    fillPolicy: 'keepExisting',
  },
  {
    testId: 'employment-add',
    control: 'action',
    label: '添加工作经历',
    expectedFieldId: null,
    expectedFill: '',
    fillPolicy: 'write',
  },
  {
    testId: 'field-github',
    control: 'shadow',
    label: 'GitHub',
    expectedFieldId: 'personal.github',
    expectedFill: 'https://github.com/zhangsan',
    fillPolicy: 'write',
    inOpenShadow: true,
  },
  {
    testId: 'field-hidden-name',
    control: 'hidden',
    label: '隐藏姓名',
    expectedFieldId: null,
    expectedFill: '',
    fillPolicy: 'skip',
    skipReason: 'hidden',
  },
  {
    testId: 'field-csrf',
    control: 'hidden',
    label: 'CSRF',
    expectedFieldId: null,
    expectedFill: '',
    fillPolicy: 'skip',
    skipReason: 'hidden',
  },
  {
    testId: 'field-disabled-id',
    control: 'disabled',
    label: '身份证件',
    expectedFieldId: null,
    expectedFill: '',
    fillPolicy: 'skip',
    skipReason: 'disabled',
  },
  {
    testId: 'field-unsupported-combobox',
    control: 'unsupported',
    label: '职级',
    expectedFieldId: null,
    expectedFill: '',
    fillPolicy: 'skip',
    skipReason: 'unsupported',
  },
  {
    testId: 'field-closed-shadow-host',
    control: 'unsupported',
    label: '内部工号',
    expectedFieldId: null,
    expectedFill: '',
    fillPolicy: 'skip',
    skipReason: 'unsupported',
  },
  {
    testId: 'submit-application',
    control: 'action',
    label: '提交申请',
    expectedFieldId: null,
    expectedFill: '',
    fillPolicy: 'skip',
    skipReason: 'submit',
  },
] as const satisfies readonly FixtureFieldExpectation[];

export function assertFixtureFieldId(fieldId: string | null): void {
  if (fieldId !== null && !isResumeFieldId(fieldId)) {
    throw new Error(`夹具映射了未知字段 ID：${fieldId}`);
  }
}
