import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusCard } from './StatusCard';

describe('StatusCard', () => {
  it('exposes its title as the section accessible name', () => {
    render(
      <StatusCard title="当前状态">
        工程初始化完成，尚未保存任何简历数据。
      </StatusCard>,
    );

    expect(
      screen.getByRole('region', { name: '当前状态' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('工程初始化完成，尚未保存任何简历数据。'),
    ).toBeVisible();
  });
});
