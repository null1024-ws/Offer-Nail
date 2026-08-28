import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import { createEmptyResumeData, type ResumeData } from '../../domain/resume';

const fixtureHtml = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../tests/fixtures/forms/application-form.html',
  ),
  'utf8',
);

export function seededResume(): ResumeData {
  const data = createEmptyResumeData();
  data.masterProfile.personal.fields = [
    {
      fieldId: 'personal.fullName',
      value: { kind: 'text', value: '张三' },
      fillPolicy: 'automatic',
    },
    {
      fieldId: 'personal.phone',
      value: { kind: 'text', value: '13800138000' },
      fillPolicy: 'confirmEveryTime',
    },
    {
      fieldId: 'personal.email',
      value: { kind: 'text', value: 'new@example.com' },
      fillPolicy: 'confirmEveryTime',
    },
    {
      fieldId: 'personal.summary',
      value: { kind: 'text', value: '本地优先的简历填写扩展作者。' },
      fillPolicy: 'automatic',
    },
    {
      fieldId: 'personal.gender',
      value: { kind: 'text', value: '男' },
      fillPolicy: 'confirmEveryTime',
    },
    {
      fieldId: 'personal.birthDate',
      value: {
        kind: 'date',
        value: { precision: 'day', year: 1998, month: 6, day: 15 },
      },
      fillPolicy: 'confirmEveryTime',
    },
    {
      fieldId: 'personal.currentCity',
      value: { kind: 'text', value: '北京' },
      fillPolicy: 'automatic',
    },
    {
      fieldId: 'personal.github',
      value: { kind: 'url', value: 'https://github.com/zhangsan' },
      fillPolicy: 'automatic',
    },
  ];
  data.masterProfile.jobPreference.fields = [
    {
      fieldId: 'jobPreference.acceptRemote',
      value: { kind: 'boolean', value: true },
      fillPolicy: 'automatic',
    },
  ];
  data.masterProfile.educations = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      section: 'education',
      fields: [
        {
          fieldId: 'education.school',
          value: { kind: 'text', value: '清华大学' },
          fillPolicy: 'automatic',
        },
        {
          fieldId: 'education.educationLevel',
          value: { kind: 'text', value: '本科' },
          fillPolicy: 'automatic',
        },
      ],
    },
  ];
  data.masterProfile.employments = [
    {
      id: '22222222-2222-4222-8222-222222222222',
      section: 'employment',
      fields: [
        {
          fieldId: 'employment.company',
          value: { kind: 'text', value: '示例科技有限公司' },
          fillPolicy: 'automatic',
        },
        {
          fieldId: 'employment.position',
          value: { kind: 'text', value: '前端实习生' },
          fillPolicy: 'automatic',
        },
      ],
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      section: 'employment',
      fields: [
        {
          fieldId: 'employment.company',
          value: { kind: 'text', value: '第二段实习公司' },
          fillPolicy: 'automatic',
        },
        {
          fieldId: 'employment.position',
          value: { kind: 'text', value: '研发实习生' },
          fillPolicy: 'automatic',
        },
      ],
    },
  ];
  return data;
}

export function loadFixtureDocument() {
  return new JSDOM(fixtureHtml, {
    runScripts: 'dangerously',
    url: 'http://127.0.0.1:4173/application-form.html',
  }).window.document;
}
