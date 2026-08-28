import {
  fieldCatalog,
  mvpFieldIds,
  type ResumeFieldId,
  type ResumeSection,
} from '../domain/resume/field-catalog';
import type { ValueFormat } from './normalize';
import { compactText } from './normalize';

export interface FieldDictionaryEntry {
  fieldId: ResumeFieldId;
  label: string;
  section: ResumeSection;
  synonyms: string[];
  attrNames: string[];
  valueHint?: ValueFormat;
}

const EXTRA_SYNONYMS: Partial<
  Record<
    ResumeFieldId,
    { synonyms?: string[]; attrs?: string[]; hint?: ValueFormat }
  >
> = {
  'personal.fullName': {
    synonyms: ['名字', '真实姓名', '中文名'],
    attrs: ['fullname', 'realname', 'truename'],
  },
  'personal.phone': {
    synonyms: ['手机', '手机号', '电话', '联系电话'],
    attrs: ['phone', 'mobile', 'tel', 'cellphone'],
    hint: 'phone',
  },
  'personal.email': {
    synonyms: ['邮箱', '电子邮箱', '邮件'],
    attrs: ['email', 'mail'],
    hint: 'email',
  },
  'personal.gender': {
    synonyms: ['性别'],
    attrs: ['gender', 'sex'],
    hint: 'gender',
  },
  'personal.birthDate': {
    synonyms: ['生日', '出生年月'],
    attrs: ['birthdate', 'birthday', 'dob'],
    hint: 'date',
  },
  'personal.currentCity': {
    synonyms: ['城市', '现居城市', '目前城市'],
    attrs: ['city', 'currentcity', 'location'],
  },
  'personal.summary': {
    synonyms: ['个人简介', '自我评价', '简介'],
    attrs: ['summary', 'about', 'bio'],
  },
  'personal.github': {
    synonyms: ['github', 'github账号'],
    attrs: ['github'],
    hint: 'github',
  },
  'jobPreference.acceptRemote': {
    synonyms: ['接受远程', '远程办公', '支持远程'],
    attrs: ['acceptremote', 'remote'],
    hint: 'boolean',
  },
  'jobPreference.position': {
    synonyms: ['申请职位', '应聘职位', '意向职位'],
    attrs: ['applyposition', 'jobtitle'],
  },
  'education.school': {
    synonyms: ['学校', '院校', '毕业院校', '学校名称'],
    attrs: ['school', 'university', 'college'],
  },
  'education.educationLevel': {
    synonyms: ['学历', '最高学历'],
    attrs: ['educationlevel', 'degreelevel'],
  },
  'education.major': {
    synonyms: ['专业', '所学专业'],
    attrs: ['major'],
  },
  'employment.company': {
    synonyms: ['公司', '单位', '任职公司', '公司名称'],
    attrs: ['company', 'employer', 'organization'],
  },
  'employment.position': {
    synonyms: ['职位名称', '职务', '岗位名称'],
    attrs: ['position'],
  },
};

const SECTION_PATTERNS: Array<[RegExp, ResumeSection]> = [
  [/教育经历|教育背景|学历信息/, 'education'],
  [/实习经历|工作经历|任职经历/, 'employment'],
  [/项目经历|项目经验/, 'project'],
  [/求职意向|期望职位|申请信息/, 'jobPreference'],
  [/基本信息|个人信息|联系方式/, 'personal'],
];

export function detectSectionContext(group: string): ResumeSection | undefined {
  const compact = compactText(group);
  for (const [pattern, section] of SECTION_PATTERNS) {
    if (pattern.test(compact) || pattern.test(group)) return section;
  }
  return undefined;
}

function unique(values: string[]): string[] {
  return [
    ...new Set(values.map(compactText).filter((item) => item.length >= 2)),
  ];
}

export const fieldDictionary: FieldDictionaryEntry[] = mvpFieldIds
  .filter((fieldId) => fieldCatalog[fieldId].kind !== 'attachment')
  .map((fieldId) => {
    const definition = fieldCatalog[fieldId];
    const extra = EXTRA_SYNONYMS[fieldId];
    return {
      fieldId,
      label: definition.label,
      section: definition.section,
      synonyms: unique([definition.label, ...(extra?.synonyms ?? [])]),
      attrNames: unique(extra?.attrs ?? [fieldId.split('.')[1] ?? '']),
      valueHint: extra?.hint,
    };
  });

export function dictionaryEntry(
  fieldId: ResumeFieldId,
): FieldDictionaryEntry | undefined {
  return fieldDictionary.find((entry) => entry.fieldId === fieldId);
}
