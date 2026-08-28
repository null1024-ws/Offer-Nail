import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyResumeData } from '../../domain/resume';
import type {
  ExtensionRequest,
  ExtensionResponse,
} from '../../runtime/protocol';
import { PopupApp } from './PopupApp';

describe('PopupApp', () => {
  it('opens onboarding when no vault exists', async () => {
    const sendMessage = vi.fn<
      (request: ExtensionRequest) => Promise<ExtensionResponse>
    >(async () => ({ ok: true, status: 'uninitialized' }));
    const openOptions = vi.fn();
    render(<PopupApp sendMessage={sendMessage} openOptions={openOptions} />);
    expect(await screen.findByText('先建立本地档案')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '打开设置页' }));
    expect(openOptions).toHaveBeenCalledOnce();
  });

  it('sends unreadable vaults to the options page', async () => {
    const sendMessage = vi.fn<
      (request: ExtensionRequest) => Promise<ExtensionResponse>
    >(async () => ({ ok: true, status: 'locked' }));
    const openOptions = vi.fn();
    render(<PopupApp sendMessage={sendMessage} openOptions={openOptions} />);
    expect(await screen.findByText('无法打开现有档案')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: '打开设置页' }));
    expect(openOptions).toHaveBeenCalledOnce();
  });

  it('scans and fills the page directly, then can undo', async () => {
    const resume = createEmptyResumeData();
    const sendMessage = vi.fn<
      (request: ExtensionRequest) => Promise<ExtensionResponse>
    >(async (request) => {
      if (request.type === 'offerNail:status') {
        return {
          ok: true,
          status: 'unlocked',
          profileName: '默认档案',
          variants: [],
        };
      }
      if (request.type === 'offerNail:scan') {
        return {
          ok: true,
          resume,
          outcomes: [
            {
              fingerprint: 'input|text|fullName',
              status: 'filled',
              previousValue: '',
            },
          ],
        };
      }
      if (request.type === 'offerNail:undoFill') {
        return { ok: true, undone: { ok: true } };
      }
      return { ok: false, error: 'unexpected' };
    });

    render(<PopupApp sendMessage={sendMessage} openOptions={vi.fn()} />);
    await userEvent.click(
      await screen.findByRole('button', { name: '扫描并填写' }),
    );
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'offerNail:scan',
      variantId: undefined,
    });
    expect(await screen.findByText('已直接填写')).toBeVisible();
    expect(screen.getByText('已填写')).toBeVisible();

    await userEvent.click(screen.getByRole('button', { name: '撤销本次填写' }));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'offerNail:undoFill' });
    expect(await screen.findByText('已恢复本次填写前的页面值。')).toBeVisible();
  });
});
