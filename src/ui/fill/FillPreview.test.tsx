import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FillPreviewItem } from '../../fill-engine/preview';
import { createEmptyResumeData } from '../../domain/resume';
import { FillPreview } from './FillPreview';

const nameItem: FillPreviewItem = {
  sourceId: 'field:0',
  fingerprint: 'input|text|fullName',
  pageLabel: '姓名',
  pageKind: 'text',
  pageName: 'fullName',
  pageValue: '',
  inShadow: false,
  fieldId: 'personal.fullName',
  proposedValue: '张三',
  confidence: 'high',
  reasons: ['标签匹配「姓名」'],
  sensitive: false,
  conflict: false,
  selected: true,
  mappingOptions: [
    { fieldId: 'personal.fullName', label: '姓名' },
    { fieldId: 'personal.englishName', label: '英文名' },
  ],
};

const phoneItem: FillPreviewItem = {
  ...nameItem,
  sourceId: 'field:1',
  fingerprint: 'input|text|phone',
  pageLabel: '手机号码',
  pageName: 'phone',
  fieldId: 'personal.phone',
  proposedValue: '13800138000',
  sensitive: true,
  selected: false,
  mappingOptions: [{ fieldId: 'personal.phone', label: '手机号码' }],
};

describe('FillPreview', () => {
  it('cancels without confirming and only submits checked rows', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn<(selected: FillPreviewItem[]) => void>();
    const onCancel = vi.fn();
    render(
      <FillPreview
        resume={createEmptyResumeData()}
        items={[nameItem, phoneItem]}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    expect(screen.getAllByText('高置信').length).toBeGreaterThan(0);
    expect(screen.getByText(/，敏感/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('checkbox', { name: '填写「手机号码」' }),
    );
    await user.click(screen.getByRole('button', { name: '确认填写' }));
    expect(onConfirm.mock.calls[0]![0].map((item) => item.fieldId)).toEqual([
      'personal.fullName',
      'personal.phone',
    ]);
  });

  it('lets the user retarget a mapping and shows fill outcomes', async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(
      <FillPreview
        resume={createEmptyResumeData()}
        items={[nameItem]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        outcomes={[
          {
            fingerprint: nameItem.fingerprint,
            status: 'filled',
            previousValue: '',
          },
        ]}
        onUndo={onUndo}
      />,
    );

    await user.selectOptions(
      screen.getByRole('combobox', { name: '姓名的档案字段' }),
      'personal.englishName',
    );
    expect(screen.getByText('拟填：（档案中无值）')).toBeVisible();
    expect(screen.getByText('已填写')).toBeVisible();
    await user.click(screen.getByRole('button', { name: '撤销本次填写' }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
