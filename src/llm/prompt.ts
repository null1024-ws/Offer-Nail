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

export type LlmSectionKey =
  (typeof LLM_SECTION_KEY)[keyof typeof LLM_SECTION_KEY];

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
    .map(([section, entries]) => `${section}：${entries.join('、')}`)
    .join('\n');
}

export function buildLlmSystemPrompt(): string {
  return `你是一名专业的简历信息提取引擎。用户会提供一份简历的纯文本，你需要把它解析成结构化字段，然后只输出一个 JSON 对象，不要输出任何解释、前后缀或代码块。

JSON 顶层键固定，重复模块用数组。每个字段的 key 必须使用下方「字段清单」里给出的英文 key，中文括号只是说明。示例结构：

{
  "personal": { "fullName": "王申", "email": "shenwang918@gmail.com", "phone": "13655651815", "github": "https://github.com/null1024-ws", "personalSite": "https://null1024-ws.github.io" },
  "educations": [
    { "school": "香港城市大学", "major": "计算机科学", "educationLevel": "硕士", "dateRange": "2026.08 — 2027.06", "researchDirection": "大语言模型在软件工程与软件安全中的应用" },
    { "school": "西北工业大学", "major": "信息安全", "degree": "工学学士", "educationLevel": "本科", "gpa": 84.04, "gpaScale": 100, "rank": "27/94", "courses": "网络安全；信息安全系统设计；操作系统与安全；密码学", "dateRange": "2020.09 — 2024.06" }
  ],
  "employments": [ { "company": "FinalRound AI", "position": "软件测试工程师", "dateRange": "2025.11 — 至今", "description": "……" } ],
  "projects": [ { "name": "定向灰盒模糊测试中的多目标调度策略研究", "role": "研究工程师", "dateRange": "2024.08 — 2025.06", "summary": "……" } ],
  "researches": [ { "title": "An LLM-Assisted … Detection", "venue": "USENIX Security Symposium", "publishedDate": "2024" } ],
  "awards": [ { "name": "西北工业大学优秀学生奖学金二等奖", "date": "2023.10" } ],
  "skills": [ { "name": "C/C++", "category": "编程语言" }, { "name": "Git", "category": "开发与研究工具" } ],
  "languages": [ { "name": "中文", "proficiency": "母语" }, { "name": "英语", "proficiency": "IELTS 6.5" } ]
}

提取规则（务必遵守）：
1. 只提取简历中明确出现的信息，绝不猜测、编造或补全缺失内容；没有就省略该字段或该数组元素。
2. 日期统一格式：区间写成 "YYYY.MM — YYYY.MM"，进行中写成 "YYYY.MM — 至今"；单个日期写 "YYYY"、"YYYY.MM" 或 "YYYY.MM.DD"。
3. 学历与学位要区分：「学历(educationLevel)」只填 本科/硕士/博士/专科/高中；「学位(degree)」填带学科前缀的完整学位，如「工学学士」「理学硕士」。
4. 教育经历里的「研究方向：xxx」→ researchDirection；「主要课程：xxx」→ courses（多个用中文分号「；」分隔）；「GPA：84.04/100」→ gpa=84.04 且 gpaScale=100；「专业排名：27/94」→ rank。注意：教育经历里若出现「科研访问学生/交换生/访问学者」等字样，这是身份或经历类型而不是专业（major），major 只填真正的学科专业名（如「计算机科学」「信息安全」）；若没有明确专业就省略 major。
5. 工作经历(employments)：company 是公司/机构名，可能没有「公司」等后缀（如「FinalRound AI」「安势信息（Sectrend）」「CySec Lab」）；position 是职位，通常含「工程师/实习生/负责人/经理」等词。不要把人名、公司一句话简介或日期当成职位。
6. 研究经历是研究项目（通常有角色如「研究工程师/科研访问学生/团队负责人」、机构、日期、工作内容），归入 projects 数组（name/role/dateRange/summary）。发表论文（形如「[1] 作者. "标题", 会议 年份」）归入 researches 数组（title/venue/publishedDate）。两者不要混淆。
7. 获奖(awards)：奖项名填入 name，括号里的时间（如「（2023 年 10 月）」）填入 date。
8. 技能(skills)：按「分类: 值1、值2」拆分，每个技能一个元素，name 填技能名、category 填分类（如「编程语言」「开发与研究工具」）。
9. 语言(languages)：每个语言一个元素，name 填语言名（如「中文」「英语」），proficiency 填掌握程度（如「母语」，或「IELTS 6.5」等）。
10. 多值字段（课程、技能、优势等）用中文分号「；」分隔；数字字段只写数字本身。
11. 值尽量保留原文，不要翻译或改写；邮箱、电话、链接、英文术语保持不变。手机号（phone）只输出 11 位数字本身，去掉 +86 前缀和连字符/空格（如 13655651815）。

字段清单（每行是「模块：字段key（中文名），字段key（中文名），…」）：

${buildFieldList()}

请根据清单输出 JSON。`;
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
