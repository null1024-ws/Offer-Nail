import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyResumeData,
  resumeDataToProfileDraft,
  type DraftRecord,
  type ProfileDraft,
} from '../../domain/resume';
import { ProfileEditor } from './ProfileEditor';

describe('ProfileEditor', () => {
  it('adds, deletes, reorders, and submits remaining MVP repeat modules', async () => {
    const user = userEvent.setup();
    const initialValue = resumeDataToProfileDraft(createEmptyResumeData());
    const onSave = vi
      .fn<(value: ProfileDraft) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(<ProfileEditor initialValue={initialValue} onSave={onSave} />);

    const languageSection = screen
      .getByRole('heading', { name: '语言能力' })
      .closest('section')!;
    const addLanguage = within(languageSection).getByRole('button', {
      name: '添加语言能力',
    });
    await user.click(addLanguage);
    await user.click(addLanguage);
    const languages = within(languageSection).getAllByLabelText(/语言类型/);
    await user.type(languages[0]!, '英语');
    await user.type(languages[1]!, '日语');
    await user.click(
      within(languageSection).getAllByRole('button', { name: '上移' })[1]!,
    );
    await user.click(
      within(languageSection).getAllByRole('button', { name: '删除' })[1]!,
    );

    for (const label of [
      '科研与论文',
      '技能',
      '证书',
      '竞赛与获奖',
      '校园与社团经历',
      '社会实践与志愿服务',
      '培训经历',
      '作品展示',
      '专利与知识产权',
    ]) {
      await user.click(
        screen.getByRole('button', {
          name: `添加${label}`,
        }),
      );
    }
    await user.click(screen.getByRole('button', { name: '保存主档案' }));

    expect(onSave).toHaveBeenCalledOnce();
    const submitted = onSave.mock.calls[0]![0];
    expect(valueOf(submitted.languages[0]!, 'language.name')).toBe('日语');
    expect(submitted.languages).toHaveLength(1);
    expect(submitted.researches).toHaveLength(1);
    expect(submitted.skills).toHaveLength(1);
    expect(submitted.certificates).toHaveLength(1);
    expect(submitted.awards).toHaveLength(1);
    expect(submitted.campusExperiences).toHaveLength(1);
    expect(submitted.volunteerExperiences).toHaveLength(1);
    expect(submitted.trainings).toHaveLength(1);
    expect(submitted.portfolios).toHaveLength(1);
    expect(submitted.intellectualProperties).toHaveLength(1);
  }, 30_000);

  it('does not silently save invalid fields', async () => {
    const user = userEvent.setup();
    const initialValue = resumeDataToProfileDraft(createEmptyResumeData());
    const onSave = vi
      .fn<(value: ProfileDraft) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(<ProfileEditor initialValue={initialValue} onSave={onSave} />);

    await user.type(screen.getByLabelText(/邮箱地址/), 'invalid-email');
    await user.click(screen.getByRole('button', { name: '保存主档案' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('requires explicit enable and destructive disable confirmations', async () => {
    const user = userEvent.setup();
    const initialValue = resumeDataToProfileDraft(createEmptyResumeData());
    const onSave = vi
      .fn<(value: ProfileDraft) => Promise<void>>()
      .mockResolvedValue(undefined);
    const confirm = vi.spyOn(window, 'confirm');
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<ProfileEditor initialValue={initialValue} onSave={onSave} />);

    const enable = screen.getByRole('button', {
      name: '启用推荐人类别',
    });
    await user.click(enable);
    expect(
      screen.queryByRole('button', { name: '添加推荐人/证明人' }),
    ).not.toBeInTheDocument();

    await user.click(enable);
    await user.click(screen.getByRole('button', { name: '添加推荐人/证明人' }));
    await user.type(screen.getByLabelText(/电话/), '13800000000');

    confirm.mockReturnValueOnce(false);
    await user.click(
      screen.getByRole('button', { name: '关闭并删除推荐人数据' }),
    );
    expect(screen.getByLabelText(/电话/)).toHaveValue('13800000000');

    confirm.mockReturnValueOnce(true);
    await user.click(
      screen.getByRole('button', { name: '关闭并删除推荐人数据' }),
    );
    expect(screen.queryByLabelText(/电话/)).not.toBeInTheDocument();

    confirm.mockReturnValueOnce(true);
    await user.click(screen.getByRole('button', { name: '启用招聘合规类别' }));
    await user.type(screen.getByLabelText(/招聘信息来源/), '校园宣讲');
    confirm.mockReturnValueOnce(false);
    await user.click(
      screen.getByRole('button', { name: '关闭并删除招聘合规数据' }),
    );
    expect(screen.getByLabelText(/招聘信息来源/)).toHaveValue('校园宣讲');
    confirm.mockReturnValueOnce(true);
    await user.click(
      screen.getByRole('button', { name: '关闭并删除招聘合规数据' }),
    );
    expect(screen.queryByLabelText(/招聘信息来源/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '保存主档案' }));
    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave.mock.calls[0]![0].referees).toEqual([]);
    expect(onSave.mock.calls[0]![0].enabledSensitiveSections).not.toContain(
      'referees',
    );
    expect(onSave.mock.calls[0]![0].compliance.recordId).toBe(
      initialValue.compliance.recordId,
    );
  }, 10_000);
});

function valueOf(record: DraftRecord, fieldId: string) {
  return record.fields.find((field) => field.fieldId === fieldId)?.value;
}
