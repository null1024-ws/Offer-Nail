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
  [/^教育(经历|背景)?$/, 'education'],
  [/^(实习|工作|任职)(经历|经验)?$/, 'employment'],
  [/^项目(经历|经验)?$/, 'project'],
  [/^语言(能力)?$/, 'language'],
  [/^(专业)?技能$/, 'skill'],
  [/^作品(展示|集)?$/, 'portfolio'],
];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE = /(?<!\d)(1[3-9]\d{9})(?!\d)/;
const GITHUB_RE = /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_.-]+\/?/i;
const URL_RE = /https?:\/\/[^\s|]+/i;
const DATE_RE =
  /(?:(?:19|20)\d{2}年(?:0?[1-9]|1[0-2])月(?:(?:0?[1-9]|[12]\d|3[01])日?)?|(?:19|20)\d{2}\.(?:0?[1-9]|1[0-2])(?:\.(?:0?[1-9]|[12]\d|3[01]))?|(?:19|20)\d{2}\/(?:0?[1-9]|1[0-2])(?:\/(?:0?[1-9]|[12]\d|3[01]))?|(?:19|20)\d{2}-(?:0?[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01])(?!\d))?|(?:19|20)\d{2})/;
const RANGE_RE = new RegExp(
  `${DATE_RE.source}\\s*[-–—~至到]\\s*(?:${DATE_RE.source}|至今|现在|present)`,
  'i',
);
const SCHOOL_RE = /[\u4e00-\u9fffA-Za-z0-9·]{2,20}(?:大学|学院|学校|中学)/;
const COMPANY_RE =
  /[\u4e00-\u9fffA-Za-z0-9·]{2,30}(?:公司|集团|银行|科技|有限|股份)/;
const DEGREE_RE = /本科|硕士|博士|专科|高中|研究生/;
const GPA_RE = /GPA[:：]?\s*(\d+(?:\.\d+)?)/i;

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

function parseDate(text: string): DateValue | undefined {
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

function parseRange(text: string): FieldValue | undefined {
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
  return line.remaining.replace(/\s+/g, ' ').trim();
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
      emit(
        candidates,
        line,
        'personal.phone',
        { kind: 'text', value: match.text },
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
  }

  const hasName = candidates.some(
    (item) => item.fieldId === 'personal.fullName',
  );
  const first = lines[0];
  if (
    !hasName &&
    first &&
    leftover(first) &&
    /^[\u4e00-\u9fff]{2,4}$/.test(leftover(first))
  ) {
    const name = leftover(first);
    first.remaining = ' '.repeat(first.remaining.length);
    emit(
      candidates,
      first,
      'personal.fullName',
      { kind: 'text', value: name },
      'medium',
      'personal',
      name,
    );
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
    return RANGE_RE.test(line.original);
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
      const degree = consume(line, DEGREE_RE);
      if (degree) {
        emit(
          candidates,
          line,
          'education.educationLevel',
          { kind: 'text', value: degree.text },
          'high',
          recordKey,
          degree.text,
        );
      }
      const gpa = consume(line, GPA_RE);
      if (gpa) {
        const numeric = Number(gpa.text.match(/\d+(?:\.\d+)?/)?.[0]);
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
    }
    if (section === 'employment') {
      const company = consume(line, COMPANY_RE);
      if (company) {
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
    }
  }

  const remainders = lines.map((line) => leftover(line)).filter(Boolean);
  if (remainders.length === 0) return;
  const combined = remainders.join(' ');
  const host = lines.find((line) => leftover(line)) ?? lines[0]!;
  if (section === 'education' && combined.length <= 20) {
    clearLeftovers(lines);
    emit(
      candidates,
      host,
      'education.major',
      { kind: 'text', value: combined },
      'medium',
      recordKey,
      combined,
    );
    return;
  }
  if (section === 'employment') {
    const position = remainders[0]!;
    if (position.length <= 16 && remainders.length > 0) {
      const positionLine =
        lines.find((line) => leftover(line) === position) ?? host;
      positionLine.remaining = ' '.repeat(positionLine.remaining.length);
      emit(
        candidates,
        positionLine,
        'employment.position',
        { kind: 'text', value: position },
        'medium',
        recordKey,
        position,
      );
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
    const name = remainders[0]!;
    if (name.length <= 40) {
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

  const unmapped = working
    .filter((line) => leftover(line).length > 0)
    .map((line) => ({ id: line.id, text: leftover(line) }));

  return { candidates, unmapped };
}
