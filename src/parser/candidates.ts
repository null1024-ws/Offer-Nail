import type {
  ResumeFieldId,
  ResumeSection,
} from '../domain/resume/field-catalog';
import type { DateValue, FieldValue } from '../domain/resume/schema';
import type { SourceLine } from './source';

export type CandidateConfidence = 'high' | 'medium';

export interface SourceSpan {
  lineId: string;
  text: string;
}

export interface FieldCandidate {
  fieldId: ResumeFieldId;
  value: FieldValue;
  confidence: CandidateConfidence;
  source: SourceSpan;
  recordKey: string;
}

export interface ParseCandidatesResult {
  candidates: FieldCandidate[];
  unmapped: SourceLine[];
}

interface MutableLine {
  id: string;
  original: string;
  remaining: string;
}

type ExperienceSection = 'education' | 'employment' | 'project';

const RANGE_FIELDS = {
  education: 'education.dateRange',
  employment: 'employment.dateRange',
  project: 'project.dateRange',
} as const satisfies Record<ExperienceSection, ResumeFieldId>;

const HEADING_PATTERNS: Array<[RegExp, ResumeSection]> = [
  [/^(基本|个人)(信息|资料)$/, 'personal'],
  [/^(自我评价|个人简介|个人总结)$/, 'personal'],
  [/^(求职|应聘)(意向|目标)$/, 'jobPreference'],
  [/^教育(经历|背景)?$/, 'education'],
  [/^(实习|工作|任职)(经历|经验)?$/, 'employment'],
  [/^项目(经历|经验)?$/, 'project'],
  [/^(研究|科研)(经历|经验|工作)$/, 'project'],
  [/^(研究|科研)(成果|论文)$/, 'research'],
  [/^(发表)?论文$/, 'research'],
  [/^学术(成果|论文)?$/, 'research'],
  [/^(获奖|荣誉|奖项|奖励)(情况|经历)?$/, 'award'],
  [/^所获(荣誉|奖励)?$/, 'award'],
  [/^(校园|学生|社团)(经历|工作|活动)?$/, 'campus'],
  [/^(志愿)(服务|经历|活动)?$/, 'volunteer'],
  [/^(培训)(经历|课程)?$/, 'training'],
  [/^(证书|资格)(证书|情况)?$/, 'certificate'],
  [/^语言(能力)?$/, 'language'],
  [/^(专业)?技能$/, 'skill'],
  [/^作品(展示|集)?$/, 'portfolio'],
];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?86[-\s]?)?(1[3-9]\d)(?:[-\s]?)(\d{4})(?:[-\s]?)(\d{4})(?!\d)/;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/?/i;
const PERSONAL_SITE_RE = /(?:https?:\/\/)?[A-Za-z0-9.-]+\.github\.io\/?/i;
const URL_RE = /https?:\/\/[^\s|]+/i;
const POSITION_RE =
  /[\u4e00-\u9fffA-Za-z]{2,8}(?:工程师|实习生|负责人|经理|总监|主管|专员|研究员|分析师|顾问|助理|访问学生|交换生)/;
const DEGREE_FULL_RE =
  /(?:工学|理学|文学|管理学|经济学|法学|医学|农学|教育学|艺术学)(?:博士|硕士|学士)/;
const LEVEL_RE = /本科|硕士|博士|专科|高中|研究生/;
const DATE_RE =
  /(?:(?:19|20)\d{2}年(?:1[0-2]|0?[1-9])月(?:(?:3[01]|[12]\d|0?[1-9])日?)?|(?:19|20)\d{2}\.(?:1[0-2]|0?[1-9])(?:\.(?:3[01]|[12]\d|0?[1-9]))?|(?:19|20)\d{2}\/(?:1[0-2]|0?[1-9])(?:\/(?:3[01]|[12]\d|0?[1-9]))?|(?:19|20)\d{2}-(?:1[0-2]|0?[1-9])(?:-(?:3[01]|[12]\d|0[1-9])(?!\d))?|(?:19|20)\d{2})/;
const RANGE_RE = new RegExp(
  `${DATE_RE.source}\\s*[-–—~至到]\\s*(?:${DATE_RE.source}|至今|现在|present)`,
  'i',
);
const SCHOOL_RE = /[\u4e00-\u9fffA-Za-z0-9·]{2,20}(?:大学|学院|学校|中学)/;
const COMPANY_RE =
  /[\u4e00-\u9fffA-Za-z0-9·]{2,30}(?:公司|集团|银行|科技|有限|股份)/;
const GPA_RE = /GPA[:：]?\s*\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)?/i;

function compact(text: string): string {
  return text.replace(/[:：\s]/g, '');
}

function detectHeading(text: string): ResumeSection | undefined {
  const normalized = compact(text);
  for (const [pattern, section] of HEADING_PATTERNS) {
    if (pattern.test(normalized)) return section;
  }
  return undefined;
}

export function parseDate(text: string): DateValue | undefined {
  const token = text.match(DATE_RE)?.[0];
  if (!token) return undefined;
  const parts = token.split(/[./]|年|月|日|-/).filter(Boolean);
  const year = Number(parts[0]);
  const month = parts[1] ? Number(parts[1]) : undefined;
  const day = parts[2] ? Number(parts[2]) : undefined;
  if (!Number.isFinite(year)) return undefined;
  if (day && month) return { precision: 'day', year, month, day };
  if (month) return { precision: 'month', year, month };
  return { precision: 'year', year };
}

export function parseRange(text: string): FieldValue | undefined {
  const match = text.match(RANGE_RE);
  if (!match) return undefined;
  const raw = match[0];
  const dates = raw.match(new RegExp(DATE_RE.source, 'g')) ?? [];
  const start = parseDate(dates[0] ?? '');
  if (!start) return undefined;
  if (/至今|现在|present/i.test(raw)) {
    return { kind: 'dateRange', value: { start, ongoing: true } };
  }
  const end = parseDate(dates[1] ?? '');
  return {
    kind: 'dateRange',
    value: { start, ...(end ? { end } : {}), ongoing: false },
  };
}

function consume(
  line: MutableLine,
  pattern: RegExp,
): { text: string; start: number } | undefined {
  const flags = pattern.flags.includes('g')
    ? pattern.flags
    : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  global.lastIndex = 0;
  const match = global.exec(line.remaining);
  if (!match) return undefined;
  const start = match.index;
  const text = match[0];
  line.remaining =
    line.remaining.slice(0, start) +
    ' '.repeat(text.length) +
    line.remaining.slice(start + text.length);
  return { text, start };
}

function leftover(line: MutableLine): string {
  return line.remaining
    .replace(/\s+/g, ' ')
    .replace(/^[·\s]+|[·\s]+$/g, '')
    .trim();
}

function clearLeftovers(lines: MutableLine[]): void {
  for (const line of lines) {
    if (leftover(line)) {
      line.remaining = ' '.repeat(line.remaining.length);
    }
  }
}

function emit(
  candidates: FieldCandidate[],
  line: MutableLine,
  fieldId: ResumeFieldId,
  value: FieldValue,
  confidence: CandidateConfidence,
  recordKey: string,
  sourceText: string,
): void {
  candidates.push({
    fieldId,
    value,
    confidence,
    recordKey,
    source: { lineId: line.id, text: sourceText },
  });
}

function parsePersonal(
  lines: MutableLine[],
  candidates: FieldCandidate[],
): void {
  for (const line of lines) {
    let labeled: { text: string; start: number } | undefined;
    if ((labeled = consume(line, /姓名[:：]\s*[\u4e00-\u9fff]{2,4}/))) {
      emit(
        candidates,
        line,
        'personal.fullName',
        { kind: 'text', value: labeled.text.replace(/^姓名[:：]\s*/, '') },
        'high',
        'personal',
        labeled.text,
      );
    }
    if ((labeled = consume(line, /性别[:：]\s*[男女]/))) {
      emit(
        candidates,
        line,
        'personal.gender',
        { kind: 'text', value: labeled.text.replace(/^性别[:：]\s*/, '') },
        'high',
        'personal',
        labeled.text,
      );
    }
    if (
      (labeled = consume(
        line,
        /(?:所在城市|现居|城市)[:：]\s*[\u4e00-\u9fff]{2,10}/,
      ))
    ) {
      emit(
        candidates,
        line,
        'personal.currentCity',
        {
          kind: 'text',
          value: labeled.text.replace(/^(?:所在城市|现居|城市)[:：]\s*/, ''),
        },
        'high',
        'personal',
        labeled.text,
      );
    }
    if ((labeled = consume(line, /籍贯[:：]\s*[\u4e00-\u9fff]{2,10}/))) {
      emit(
        candidates,
        line,
        'personal.hometown',
        { kind: 'text', value: labeled.text.replace(/^籍贯[:：]\s*/, '') },
        'high',
        'personal',
        labeled.text,
      );
    }

    let match: { text: string; start: number } | undefined;
    while ((match = consume(line, EMAIL_RE))) {
      if (candidates.some((item) => item.fieldId === 'personal.email')) break;
      emit(
        candidates,
        line,
        'personal.email',
        { kind: 'text', value: match.text },
        'high',
        'personal',
        match.text,
      );
    }
    while ((match = consume(line, PHONE_RE))) {
      if (candidates.some((item) => item.fieldId === 'personal.phone')) break;
      const digits = match.text
        .replace(/\D/g, '')
        .replace(/^86(?=1[3-9]\d{9}$)/, '');
      emit(
        candidates,
        line,
        'personal.phone',
        { kind: 'text', value: digits },
        'high',
        'personal',
        match.text,
      );
    }
    while ((match = consume(line, GITHUB_RE))) {
      if (candidates.some((item) => item.fieldId === 'personal.github')) break;
      const url = match.text.startsWith('http')
        ? match.text.replace(/\/$/, '')
        : `https://${match.text.replace(/\/$/, '')}`;
      emit(
        candidates,
        line,
        'personal.github',
        { kind: 'url', value: url },
        'high',
        'personal',
        match.text,
      );
    }
    while ((match = consume(line, PERSONAL_SITE_RE))) {
      if (candidates.some((item) => item.fieldId === 'personal.personalSite'))
        break;
      const url = match.text.startsWith('http')
        ? match.text.replace(/\/$/, '')
        : `https://${match.text.replace(/\/$/, '')}`;
      emit(
        candidates,
        line,
        'personal.personalSite',
        { kind: 'url', value: url },
        'high',
        'personal',
        match.text,
      );
    }
  }

  const hasName = candidates.some(
    (item) => item.fieldId === 'personal.fullName',
  );
  if (!hasName) {
    for (const line of lines.slice(0, 3)) {
      const text = leftover(line);
      if (!text) continue;
      if (/^(简历|个人简历|求职|应聘|Curriculum|Vitae)$/i.test(text)) continue;
      const whole = text.match(/^[\u4e00-\u9fff]{2,4}$/);
      const prefix = text.match(
        /^([\u4e00-\u9fff]{2,4})(?=\s|·|[A-Za-z0-9]|$)/,
      );
      const name = whole?.[0] ?? prefix?.[1];
      if (!name) continue;
      const start = line.remaining.indexOf(name);
      if (start >= 0) {
        line.remaining =
          line.remaining.slice(0, start) +
          ' '.repeat(name.length) +
          line.remaining.slice(start + name.length);
      }
      emit(
        candidates,
        line,
        'personal.fullName',
        { kind: 'text', value: name },
        'medium',
        'personal',
        name,
      );
      break;
    }
  }
}

function splitRecords(
  lines: MutableLine[],
  section: ExperienceSection,
): MutableLine[][] {
  const records: MutableLine[][] = [];
  let current: MutableLine[] = [];
  const isBoundary = (line: MutableLine) => {
    if (section === 'education') return SCHOOL_RE.test(line.original);
    if (section === 'employment') return COMPANY_RE.test(line.original);
    return POSITION_RE.test(line.original);
  };
  for (const line of lines) {
    if (current.length > 0 && isBoundary(line)) {
      records.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) records.push(current);
  return records;
}

function parseExperienceRecord(
  lines: MutableLine[],
  section: ExperienceSection,
  recordKey: string,
  candidates: FieldCandidate[],
): void {
  let positionEmitted = false;
  let companyEmitted = false;
  let positionLine: MutableLine | undefined;

  for (const line of lines) {
    const range = consume(line, RANGE_RE);
    if (range) {
      const value = parseRange(range.text);
      if (value) {
        emit(
          candidates,
          line,
          RANGE_FIELDS[section],
          value,
          'high',
          recordKey,
          range.text,
        );
      }
    }

    if (section === 'education') {
      const school = consume(line, SCHOOL_RE);
      if (school) {
        emit(
          candidates,
          line,
          'education.school',
          { kind: 'text', value: school.text },
          'high',
          recordKey,
          school.text,
        );
      }
      const degree = consume(line, DEGREE_FULL_RE);
      if (degree) {
        emit(
          candidates,
          line,
          'education.degree',
          { kind: 'text', value: degree.text },
          'high',
          recordKey,
          degree.text,
        );
        const levelWord = degree.text.match(/博士|硕士|学士/)?.[0];
        if (levelWord) {
          emit(
            candidates,
            line,
            'education.educationLevel',
            { kind: 'text', value: levelWord === '学士' ? '本科' : levelWord },
            'high',
            recordKey,
            levelWord,
          );
        }
      }
      const level = consume(line, LEVEL_RE);
      if (level) {
        emit(
          candidates,
          line,
          'education.educationLevel',
          { kind: 'text', value: level.text },
          'high',
          recordKey,
          level.text,
        );
      }
      const gpa = consume(line, GPA_RE);
      if (gpa) {
        const nums = gpa.text.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        const numeric = nums[0];
        if (numeric !== undefined && Number.isFinite(numeric)) {
          emit(
            candidates,
            line,
            'education.gpa',
            { kind: 'number', value: numeric },
            'high',
            recordKey,
            gpa.text,
          );
        }
        if (nums[1] !== undefined && Number.isFinite(nums[1])) {
          emit(
            candidates,
            line,
            'education.gpaScale',
            { kind: 'number', value: nums[1] },
            'high',
            recordKey,
            gpa.text,
          );
        }
      }
      const direction = consume(line, /研究方向[:：]\s*.+/);
      if (direction) {
        const value = direction.text.replace(/^研究方向[:：]\s*/, '').trim();
        if (value) {
          emit(
            candidates,
            line,
            'education.researchDirection',
            { kind: 'text', value },
            'high',
            recordKey,
            direction.text,
          );
        }
      }
      const rank = consume(line, /(?:专业)?排名[:：]?\s*\d+\s*\/\s*\d+/);
      if (rank) {
        const value = rank.text.match(/\d+\s*\/\s*\d+/)?.[0] ?? '';
        emit(
          candidates,
          line,
          'education.rank',
          { kind: 'text', value },
          'high',
          recordKey,
          rank.text,
        );
      }
      const courses = consume(line, /主要课程[:：]\s*.+/);
      if (courses) {
        const value = courses.text
          .replace(/^主要课程[:：]\s*/, '')
          .split(/[、,，;；]/)
          .map((item) => item.trim())
          .filter(Boolean);
        if (value.length > 0) {
          emit(
            candidates,
            line,
            'education.courses',
            { kind: 'stringList', value },
            'high',
            recordKey,
            courses.text,
          );
        }
      }
    }

    if (section === 'employment') {
      const company = consume(line, COMPANY_RE);
      if (company) {
        companyEmitted = true;
        emit(
          candidates,
          line,
          'employment.company',
          { kind: 'text', value: company.text },
          'high',
          recordKey,
          company.text,
        );
      }
      const position = consume(line, POSITION_RE);
      if (position) {
        positionEmitted = true;
        positionLine = line;
        emit(
          candidates,
          line,
          'employment.position',
          { kind: 'text', value: position.text },
          'high',
          recordKey,
          position.text,
        );
      }
    }

    if (section === 'project') {
      const url = consume(line, URL_RE);
      if (url) {
        emit(
          candidates,
          line,
          'project.url',
          { kind: 'url', value: url.text.replace(/\/$/, '') },
          'high',
          recordKey,
          url.text,
        );
      }
      const role = consume(line, POSITION_RE);
      if (role) {
        emit(
          candidates,
          line,
          'project.role',
          { kind: 'text', value: role.text },
          'high',
          recordKey,
          role.text,
        );
      }
    }
  }

  const remainders = lines.map((line) => leftover(line)).filter(Boolean);
  const host = lines.find((line) => leftover(line)) ?? lines[0]!;

  if (section === 'education') {
    const majorText = remainders.find(
      (text) =>
        text.length <= 20 &&
        !/[：:]/.test(text) &&
        !/研究方向|课程|排名|GPA|访问|交换|学生|工程师|研究员|负责人|实习|Lab|实验室/.test(
          text,
        ),
    );
    if (majorText) {
      const majorLine =
        lines.find((line) => leftover(line) === majorText) ?? host;
      majorLine.remaining = ' '.repeat(majorLine.remaining.length);
      emit(
        candidates,
        majorLine,
        'education.major',
        { kind: 'text', value: majorText },
        'medium',
        recordKey,
        majorText,
      );
    }
    return;
  }

  if (section === 'employment') {
    if (!positionEmitted && remainders.length > 0) {
      const position = remainders[0]!;
      if (
        position.length <= 16 &&
        !/主要工作|^[•‣·]|驱动|平台|^[A-Z]/.test(position)
      ) {
        const fallbackLine =
          lines.find((line) => leftover(line) === position) ?? host;
        fallbackLine.remaining = ' '.repeat(fallbackLine.remaining.length);
        emit(
          candidates,
          fallbackLine,
          'employment.position',
          { kind: 'text', value: position },
          'medium',
          recordKey,
          position,
        );
      }
    }
    if (!companyEmitted && positionLine) {
      const companyText = leftover(positionLine);
      if (
        companyText &&
        companyText.length <= 40 &&
        !/主要工作|^[•‣·]|驱动|平台|简介|^[A-Z]{2}/.test(companyText)
      ) {
        positionLine.remaining = ' '.repeat(positionLine.remaining.length);
        emit(
          candidates,
          positionLine,
          'employment.company',
          { kind: 'text', value: companyText },
          'medium',
          recordKey,
          companyText,
        );
      }
    }
    const description = lines
      .map((line) => leftover(line))
      .filter(Boolean)
      .join('\n');
    if (description) {
      const descLine = lines.find((line) => leftover(line)) ?? host;
      clearLeftovers(lines);
      emit(
        candidates,
        descLine,
        'employment.description',
        { kind: 'text', value: description },
        'medium',
        recordKey,
        description,
      );
    }
    return;
  }

  if (section === 'project') {
    const name = remainders[0];
    if (name && name.length <= 40) {
      const nameLine = lines.find((line) => leftover(line) === name) ?? host;
      nameLine.remaining = ' '.repeat(nameLine.remaining.length);
      emit(
        candidates,
        nameLine,
        'project.name',
        { kind: 'text', value: name },
        'medium',
        recordKey,
        name,
      );
    }
    const summary = lines
      .map((line) => leftover(line))
      .filter(Boolean)
      .join('\n');
    if (summary) {
      const summaryLine = lines.find((line) => leftover(line)) ?? host;
      clearLeftovers(lines);
      emit(
        candidates,
        summaryLine,
        'project.summary',
        { kind: 'text', value: summary },
        'medium',
        recordKey,
        summary,
      );
    }
  }
}

function parseAwards(lines: MutableLine[], candidates: FieldCandidate[]): void {
  let index = 0;
  for (const line of lines) {
    const text = leftover(line);
    if (!text) continue;
    const withDate = text.match(
      /^[•‣·*-]\s*(.+?)[（(]\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*[）)]/,
    );
    if (withDate) {
      const name = withDate[1]!.trim();
      const date = parseDate(`${withDate[2]}年${withDate[3]}月`);
      line.remaining = ' '.repeat(line.remaining.length);
      if (name) {
        emit(
          candidates,
          line,
          'award.name',
          { kind: 'text', value: name },
          'high',
          `award:${index}`,
          name,
        );
      }
      if (date) {
        emit(
          candidates,
          line,
          'award.date',
          { kind: 'date', value: date },
          'high',
          `award:${index}`,
          `${withDate[2]}年${withDate[3]}月`,
        );
      }
      index += 1;
      continue;
    }
    if (/^[•‣·*-]?\s*(主要奖项|获奖|荣誉|奖励|奖项)/.test(text)) {
      line.remaining = ' '.repeat(line.remaining.length);
      continue;
    }
    const name = text.replace(/^[•‣·*-]\s*/, '').trim();
    if (name) {
      line.remaining = ' '.repeat(line.remaining.length);
      emit(
        candidates,
        line,
        'award.name',
        { kind: 'text', value: name },
        'medium',
        `award:${index}`,
        name,
      );
      index += 1;
    }
  }
}

const SKILL_CATEGORY_RE =
  /^[•‣·*-]?\s*(编程语言|开发与研究工具|开发工具|研究工具|技术栈|框架|数据库|操作系统|工具)\s*[:：]?\s*(.+)$/;

function parseLanguageItems(
  text: string,
): Array<{ name: string; proficiency?: string }> {
  const items: Array<{ name: string; proficiency?: string }> = [];
  const re = /([\u4e00-\u9fffA-Za-z]+)(?:[（(]([^（）]*)[）)])?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const name = match[1];
    if (!name) continue;
    const note = match[2];
    const proficiency = note?.match(
      /(母语|流利|精通|熟练|良好|一般|基础)/,
    )?.[1];
    items.push({ name, ...(proficiency ? { proficiency } : {}) });
  }
  return items;
}

function parseSkills(lines: MutableLine[], candidates: FieldCandidate[]): void {
  let skillIndex = 0;
  let languageIndex = 0;
  for (const line of lines) {
    const text = leftover(line);
    if (!text) continue;
    const languageMatch = text.match(/^[•‣·*-]?\s*语言能力\s*[:：]\s*(.+)$/);
    if (languageMatch) {
      line.remaining = ' '.repeat(line.remaining.length);
      const items = parseLanguageItems(languageMatch[1]!);
      for (const item of items) {
        const key = `language:${languageIndex}`;
        emit(
          candidates,
          line,
          'language.name',
          { kind: 'text', value: item.name },
          'high',
          key,
          item.name,
        );
        if (item.proficiency) {
          emit(
            candidates,
            line,
            'language.proficiency',
            { kind: 'text', value: item.proficiency },
            'high',
            key,
            item.proficiency,
          );
        }
        languageIndex += 1;
      }
      continue;
    }
    const skillMatch = text.match(SKILL_CATEGORY_RE);
    if (skillMatch) {
      const category = skillMatch[1]!;
      const items = skillMatch[2]!
        .split(/[、,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean);
      line.remaining = ' '.repeat(line.remaining.length);
      for (const item of items) {
        const key = `skill:${skillIndex}`;
        emit(
          candidates,
          line,
          'skill.name',
          { kind: 'text', value: item },
          'high',
          key,
          item,
        );
        emit(
          candidates,
          line,
          'skill.category',
          { kind: 'text', value: category },
          'high',
          key,
          category,
        );
        skillIndex += 1;
      }
    }
  }
}

function parseLanguages(
  lines: MutableLine[],
  candidates: FieldCandidate[],
): void {
  let index = 0;
  for (const line of lines) {
    const text = leftover(line);
    if (!text) continue;
    const match = text.match(/^[•‣·*-]?\s*语言能力\s*[:：]\s*(.+)$/);
    if (!match) continue;
    line.remaining = ' '.repeat(line.remaining.length);
    const items = parseLanguageItems(match[1]!);
    for (const item of items) {
      const key = `language:${index}`;
      emit(
        candidates,
        line,
        'language.name',
        { kind: 'text', value: item.name },
        'high',
        key,
        item.name,
      );
      if (item.proficiency) {
        emit(
          candidates,
          line,
          'language.proficiency',
          { kind: 'text', value: item.proficiency },
          'high',
          key,
          item.proficiency,
        );
      }
      index += 1;
    }
  }
}

function parseResearch(
  lines: MutableLine[],
  candidates: FieldCandidate[],
): void {
  const texts = lines.map((line) => leftover(line)).filter(Boolean);
  if (texts.length === 0) return;
  const host = lines.find((line) => leftover(line)) ?? lines[0]!;
  const joined = texts.join(' ').replace(/\s+/g, ' ').trim();
  const papers = joined
    .split(/\s*‣\s*(?=\[\d+\]|\S)/)
    .map((item) => item.replace(/^\[\d+\]\s*/, '').trim())
    .filter(Boolean);
  let index = 0;
  let extracted = 0;
  for (const paper of papers) {
    const title = paper
      .match(/[“"](.+?)[”"]/)?.[1]
      ?.replace(/[,，;；.。\s]+$/, '');
    if (!title) continue;
    const rest = paper
      .slice(paper.indexOf(title) + title.length)
      .replace(/[“”"",，.。]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const yearMatch = rest.match(/(?:19|20)\d{2}/);
    const key = `research:${index}`;
    emit(
      candidates,
      host,
      'research.title',
      { kind: 'text', value: title },
      'medium',
      key,
      title,
    );
    if (rest) {
      emit(
        candidates,
        host,
        'research.venue',
        { kind: 'text', value: rest },
        'medium',
        key,
        rest,
      );
    }
    if (yearMatch) {
      const date = parseDate(yearMatch[0]);
      if (date) {
        emit(
          candidates,
          host,
          'research.publishedDate',
          { kind: 'date', value: date },
          'medium',
          key,
          yearMatch[0],
        );
      }
    }
    index += 1;
    extracted += 1;
  }
  if (extracted > 0) {
    for (const line of lines) {
      line.remaining = ' '.repeat(line.remaining.length);
    }
  }
}

export function parseResumeCandidates(
  lines: SourceLine[],
): ParseCandidatesResult {
  const working: MutableLine[] = lines.map((line) => ({
    id: line.id,
    original: line.text,
    remaining: line.text,
  }));
  const candidates: FieldCandidate[] = [];
  const sections = new Map<ResumeSection | 'personal', MutableLine[]>();
  let current: ResumeSection | 'personal' = 'personal';

  for (const line of working) {
    const heading = detectHeading(line.original);
    if (heading) {
      line.remaining = ' '.repeat(line.remaining.length);
      current = heading;
      continue;
    }
    const bucket = sections.get(current) ?? [];
    bucket.push(line);
    sections.set(current, bucket);
  }

  parsePersonal(sections.get('personal') ?? [], candidates);

  (['education', 'employment', 'project'] as const).forEach((section) => {
    const records = splitRecords(sections.get(section) ?? [], section);
    records.forEach((record, index) => {
      parseExperienceRecord(record, section, `${section}:${index}`, candidates);
    });
  });

  parseAwards(sections.get('award') ?? [], candidates);
  parseSkills(sections.get('skill') ?? [], candidates);
  parseLanguages(sections.get('language') ?? [], candidates);
  parseResearch(sections.get('research') ?? [], candidates);

  const unmapped = working
    .filter((line) => /[\u4e00-\u9fffA-Za-z0-9]/.test(leftover(line)))
    .map((line) => ({ id: line.id, text: leftover(line) }));

  return { candidates, unmapped };
}
