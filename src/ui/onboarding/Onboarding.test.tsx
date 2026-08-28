import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Onboarding } from './Onboarding';

async function fillForm(
  password: string,
  confirmation = password,
  accept = true,
) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^主密码$/), password);
  await user.type(screen.getByLabelText('再次输入主密码'), confirmation);
  if (accept) {
    await user.click(screen.getByRole('checkbox'));
  }
  await user.click(screen.getByRole('button', { name: '创建空白档案' }));
}

describe('Onboarding', () => {
  it('blocks weak and mismatched passwords', async () => {
    const onInitialize = vi.fn(async () => undefined);
    const { rerender } = render(<Onboarding onInitialize={onInitialize} />);
    await fillForm('short1');
    expect(screen.getByRole('alert')).toHaveTextContent(
      '主密码至少需要 12 个字符',
    );
    expect(onInitialize).not.toHaveBeenCalled();

    rerender(<Onboarding onInitialize={onInitialize} />);
    await userEvent.clear(screen.getByLabelText(/^主密码$/));
    await userEvent.clear(screen.getByLabelText('再次输入主密码'));
    await fillForm('secure-password-123', 'different-password-123', false);
    expect(screen.getByRole('alert')).toHaveTextContent(
      '两次输入的主密码不一致',
    );
  });

  it('creates a named blank profile after risk acknowledgement', async () => {
    const onInitialize = vi.fn(async () => undefined);
    render(<Onboarding onInitialize={onInitialize} />);
    const profileName = screen.getByLabelText('档案名称');
    await userEvent.clear(profileName);
    await userEvent.type(profileName, '前端校招');
    await fillForm('secure-password-123');

    expect(onInitialize).toHaveBeenCalledWith({
      password: 'secure-password-123',
      profileName: '前端校招',
    });
  });

  it('shows a safe retry message when initialization fails', async () => {
    render(
      <Onboarding
        onInitialize={vi.fn(async () => {
          throw new Error('storage failure');
        })}
      />,
    );
    await fillForm('secure-password-123');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '初始化失败，请重试；现有数据未被修改',
    );
  });
});
