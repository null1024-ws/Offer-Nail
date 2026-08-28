import { z } from 'zod';
import {
  fieldCatalog,
  mvpFieldIds,
  type ResumeSection,
} from '../domain/resume/field-catalog';

export const LLM_SECTION_KEY = {
  personal: 'personal',
  jobPreference: 'jobPreference',
  education: 'educations',
  employment: 'employments',
  project: 'projects',
  research: 'researches',
  language: 'languages',
  skill: 'skills',
  certificate: 'certificates',
  award: 'awards',
  campus: 'campusExperiences',
  volunteer: 'volunteerExperiences',
  training: 'trainings',
  portfolio: 'portfolios',
  intellectualProperty: 'intellectualProperties',
} as const satisfies Partial<Record<ResumeSection, string>>;

export type LlmSectionKey = (typeof LLM_SECTION_KEY)[keyof typeof LLM_SECTION_KEY];

const SKIPPED_SECTIONS = new Set<ResumeSection>(['referee', 'compliance']);

function shortName(fieldId: string): string {
  const dot = fieldId.indexOf('.');
  return dot === -1 ? fieldId : fieldId.slice(dot + 1);
}

function fieldCatalogLines(): Array<{
  section: ResumeSection;
  key: string;
  label: string;
}> {
  const lines: Array<{ section: ResumeSection; key: string; label: string }> =
    [];
  for (const fieldId of mvpFieldIds) {
    const definition = fieldCatalog[fieldId];
    if (definition.kind === 'attachment') continue;
    if (SKIPPED_SECTIONS.has(definition.section)) continue;
    if (definition.sensitivity === 'highlySensitive') continue;
    lines.push({
      section: definition.section,
      key: shortName(fieldId),
      label: definition.label,
    });
  }
  return lines;
}

function buildFieldList(): string {
  const grouped = new Map<ResumeSection, string[]>();
  for (const line of fieldCatalogLines()) {
    const list = grouped.get(line.section) ?? [];
    list.push(`${line.key}（${line.label}）`);
    grouped.set(line.section, list);
  }
  return Array.from(grouped.entries())
    .map(
      ([section, entries]) =>
        `${section}：${entries.join('、')}`,
    )
    .join('\n');
}

export function buildLlmSystemPrompt(): string {
  return `你是一个简历信息提取助手。用户会提供一份简历的纯文本，你需要从中提取结构化的简历字段。

你只能输出一个 JSON 对象，不要输出任何其他文字。JSON 顶层键固定，重复模块（教育、工作、项目、技能、语言等）用数组表示。示例结构：

{
  "personal": { "fullName": "李四", "email": "lisi@example.com" },
  "jobPreference": { "position": "前端工程师" },
  "educations": [ { "school": "清华大学", "major": "计算机科学", "dateRange": "2019.09 — 2023.06" } ],
  "employments": [ { "company": "某公司", "position": "实习生", "dateRange": "2025.06 — 至今" } ],
  "projects": [],
  "skills": [ { "name": "C/C++" } ]
}

提取规则：
1. 只提取简历中明确出现的信息，绝不猜测、编造或补全缺失内容。
2. 日期区间统一写成 "YYYY.MM — YYYY.MM"，进行中写成 "YYYY.MM — 至今"，单个日期写 "YYYY" 或 "YYYY.MM" 或 "YYYY.MM.DD"。
3. 多值字段（技能、优势、课程等）用中文分号 "；" 分隔。
4. 数字字段（GPA、分数、排名等）只写数字本身，不要加单位或说明。
5. 重复模块按简历中出现的顺序输出为数组元素，每个元素是一个对象。
6. 没有对应信息时省略该字段或输出空数组，不要填 null 或占位符。
7. 值尽量保留原文，不要翻译或改写。
8. 邮箱、电话、链接等保持不变。

字段清单（每行是「模块：字段key（中文名）」）：

${buildFieldList()}

请根据上述清单输出 JSON。`;
}

export function buildLlmUserPrompt(resumeText: string): string {
  return `以下是简历文本：\n\n${resumeText}`;
}

const llmValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
]);

const llmFieldMapSchema = z.record(z.string(), llmValueSchema);

export const llmOutputSchema = z.object({
  personal: llmFieldMapSchema.optional(),
  jobPreference: llmFieldMapSchema.optional(),
  educations: z.array(llmFieldMapSchema).optional(),
  employments: z.array(llmFieldMapSchema).optional(),
  projects: z.array(llmFieldMapSchema).optional(),
  researches: z.array(llmFieldMapSchema).optional(),
  languages: z.array(llmFieldMapSchema).optional(),
  skills: z.array(llmFieldMapSchema).optional(),
  certificates: z.array(llmFieldMapSchema).optional(),
  awards: z.array(llmFieldMapSchema).optional(),
  campusExperiences: z.array(llmFieldMapSchema).optional(),
  volunteerExperiences: z.array(llmFieldMapSchema).optional(),
  trainings: z.array(llmFieldMapSchema).optional(),
  portfolios: z.array(llmFieldMapSchema).optional(),
  intellectualProperties: z.array(llmFieldMapSchema).optional(),
});

export type LlmOutput = z.infer<typeof llmOutputSchema>;
export type LlmFieldMap = z.infer<typeof llmFieldMapSchema>;
