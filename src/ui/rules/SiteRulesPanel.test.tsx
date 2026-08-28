import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { SiteMappingRule } from '../../page-mapping/rules';
import { SiteRulesPanel } from './SiteRulesPanel';

const rule: SiteMappingRule = {
  id: 'rule-1',
  origin: 'http://127.0.0.1:4173',
  pageSignature: 'sig',
  fieldFingerprint: 'input|text|fullName',
  targetFieldId: 'personal.fullName',
  transform: 'identity',
  enabled: true,
  confirmedAt: '2026-08-28T00:00:00.000Z',
};

describe('SiteRulesPanel', () => {
  it('disables and deletes a stored rule without exposing resume values', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn<(rules: SiteMappingRule[]) => Promise<void>>();
    const { rerender } = render(
      <SiteRulesPanel rules={[rule]} onChange={onChange} />,
    );
    expect(screen.getByText(/127\.0\.0\.1:4173/)).toBeVisible();
    expect(screen.getByText(/姓名/)).toBeVisible();
    expect(screen.queryByText('张三')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '禁用' }));
    expect(onChange.mock.calls[0]![0][0]?.enabled).toBe(false);

    rerender(
      <SiteRulesPanel
        rules={[{ ...rule, enabled: false }]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(onChange.mock.calls[1]![0]).toEqual([]);
  });
});
