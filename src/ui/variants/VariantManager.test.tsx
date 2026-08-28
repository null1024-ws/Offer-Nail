import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyResumeData, type ResumeData } from '../../domain/resume';
import { VariantManager } from './VariantManager';

function seededMaster(): ResumeData {
  const data = createEmptyResumeData();
  data.masterProfile.personal.fields = [
    {
      fieldId: 'personal.fullName',
      value: { kind: 'text', value: '张三' },
      fillPolicy: 'automatic',
    },
    {
      fieldId: 'personal.summary',
      value: { kind: 'text', value: '通用简介' },
      fillPolicy: 'automatic',
    },
  ];
  return data;
}

function Harness({ initial }: { initial: ResumeData }) {
  const [value, setValue] = useState(initial);
  return (
    <VariantManager
      value={value}
      onChange={async (next) => {
        setValue(next);
      }}
    />
  );
}

describe('VariantManager', () => {
  it('creates a variant, shows inherited values, then restores the master after clearing an override', async () => {
    const user = userEvent.setup();
    render(<Harness initial={seededMaster()} />);

    await user.type(screen.getByLabelText('新变体名称'), '前端开发');
    await user.click(screen.getByRole('button', { name: '创建变体' }));

    const summaryField = screen
      .getByLabelText('个人简介/自我评价变体值')
      .closest('label')!;
    expect(within(summaryField).getByText('继承主档案')).toBeVisible();
    expect(within(summaryField).getByText('主档案：通用简介')).toBeVisible();
    expect(screen.queryByLabelText('姓名变体值')).not.toBeInTheDocument();

    const summary =
      within(summaryField).getByLabelText('个人简介/自我评价变体值');
    await user.clear(summary);
    await user.type(summary, '前端向简介');
    await user.tab();

    expect(await within(summaryField).findByText('当前变体覆盖')).toBeVisible();
    await user.click(
      within(summaryField).getByRole('button', { name: '清除覆盖并恢复继承' }),
    );
    expect(await within(summaryField).findByText('继承主档案')).toBeVisible();
    expect(
      within(summaryField).getByLabelText('个人简介/自我评价变体值'),
    ).toHaveValue('通用简介');
  });

  it('renames, copies, and deletes the selected variant', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness initial={seededMaster()} />);

    await user.type(screen.getByLabelText('新变体名称'), '前端开发');
    await user.click(screen.getByRole('button', { name: '创建变体' }));

    const name = screen.getByLabelText('变体名称');
    await user.clear(name);
    await user.type(name, '前端校招');
    await user.click(screen.getByRole('button', { name: '保存名称' }));
    expect(screen.getByRole('option', { name: '前端校招' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '复制' }));
    expect(screen.getByRole('option', { name: '前端校招 副本' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(
      screen.queryByRole('option', { name: '前端校招 副本' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: '前端校招' })).toBeVisible();
  });
});
