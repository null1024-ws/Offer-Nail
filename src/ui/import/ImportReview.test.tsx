import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyResumeData, type ResumeData } from '../../domain/resume';
import type { FieldCandidate } from '../../parser/candidates';
import { ImportReview } from './ImportReview';

const email: FieldCandidate = {
  fieldId: 'personal.email',
  value: { kind: 'text', value: 'new@example.com' },
  confidence: 'high',
  recordKey: 'personal',
  source: { lineId: 'line:1', text: 'new@example.com' },
};

const note = { id: 'line:9', text: '无法归类的句子' };

const school: FieldCandidate = {
  fieldId: 'education.school',
  value: { kind: 'text', value: '清华大学' },
  confidence: 'medium',
  recordKey: 'education:0',
  source: { lineId: 'line:2', text: '清华大学' },
};

describe('ImportReview', () => {
  it('cancels without writing and applies only checked candidates', async () => {
    const user = userEvent.setup();
    const resume = createEmptyResumeData();
    const onApply = vi.fn<(next: ResumeData) => Promise<void>>();
    const onCancel = vi.fn();
    render(
      <ImportReview
        resume={resume}
        candidates={[email, school]}
        unmapped={[note]}
        onApply={onApply}
        onCancel={onCancel}
      />,
    );

    await user.click(screen.getByRole('button', { name: '取消导入' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
    expect(resume.masterProfile.personal.fields).toEqual([]);

    await user.click(screen.getByRole('button', { name: '写入选中字段' }));
    expect(onApply).toHaveBeenCalledOnce();
    const written = onApply.mock.calls[0]![0];
    expect(
      written.masterProfile.personal.fields.map((entry) => entry.fieldId),
    ).toEqual(['personal.email']);
    expect(written.masterProfile.educations).toEqual([]);
  });

  it('keeps an existing value unless overwrite is confirmed', async () => {
    const user = userEvent.setup();
    const resume = createEmptyResumeData();
    resume.masterProfile.personal.fields.push({
      fieldId: 'personal.email',
      value: { kind: 'text', value: 'old@example.com' },
      fillPolicy: 'confirmEveryTime',
    });
    const onApply = vi.fn<(next: ResumeData) => Promise<void>>();
    render(
      <ImportReview
        resume={resume}
        candidates={[email]}
        unmapped={[]}
        onApply={onApply}
        onCancel={() => undefined}
      />,
    );

    expect(screen.getByText('档案已有：old@example.com')).toBeVisible();
    await user.click(
      screen.getByRole('checkbox', { name: '接受「邮箱地址」' }),
    );
    await user.click(screen.getByRole('button', { name: '写入选中字段' }));
    expect(
      onApply.mock.calls[0]![0].masterProfile.personal.fields[0]?.value,
    ).toEqual({ kind: 'text', value: 'old@example.com' });

    await user.click(screen.getByRole('checkbox', { name: '覆盖已有值' }));
    await user.click(screen.getByRole('button', { name: '写入选中字段' }));
    expect(
      onApply.mock.calls[1]![0].masterProfile.personal.fields[0]?.value,
    ).toEqual({ kind: 'text', value: 'new@example.com' });
  });

  it('writes a user-modified candidate value', async () => {
    const user = userEvent.setup();
    const resume = createEmptyResumeData();
    const onApply = vi.fn<(next: ResumeData) => Promise<void>>();
    render(
      <ImportReview
        resume={resume}
        candidates={[email]}
        unmapped={[]}
        onApply={onApply}
        onCancel={() => undefined}
      />,
    );

    const input = screen.getByLabelText('将写入的邮箱地址');
    await user.clear(input);
    await user.type(input, 'edited@example.com');
    await user.click(screen.getByRole('button', { name: '写入选中字段' }));
    expect(
      onApply.mock.calls[0]![0].masterProfile.personal.fields[0]?.value,
    ).toEqual({ kind: 'text', value: 'edited@example.com' });
  });
});
