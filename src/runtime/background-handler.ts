import {
  migrateResumeData,
  resumeForFill,
  type ResumeData,
} from '../domain/resume';
import {
  fillRequestFromPreview,
  planPageFill,
  rulesFromConfirmedFill,
  type PageFillPlan,
} from '../fill-engine';
import type { PageCollection } from '../page-mapping/collector';
import type { DeviceSecretStore } from '../vault/device-secret';
import type { VaultRepository } from '../vault/repository';
import { VaultLockedError, type VaultSession } from '../vault/session';
import { resetLocalData } from '../vault/backup';
import type { ExtensionRequest, ExtensionResponse } from './protocol';

export interface BackgroundFillDeps {
  session: VaultSession<ResumeData>;
  repository: VaultRepository;
  secrets: DeviceSecretStore;
  getActiveTabId: () => Promise<number>;
  ensureScript: (tabId: number) => Promise<void>;
  sendToTab: (tabId: number, message: ExtensionRequest) => Promise<unknown>;
  clearLlmConfig?: () => Promise<void>;
}

export function createBackgroundHandler(deps: BackgroundFillDeps) {
  let lastPlan:
    | {
        collection: PageCollection;
        plan: PageFillPlan;
      }
    | undefined;

  async function collectFromTab(tabId: number) {
    await deps.ensureScript(tabId);
    const response = (await deps.sendToTab(tabId, {
      type: 'offerNail:collect',
    })) as ExtensionResponse;
    if (!response || !response.ok || !('collection' in response)) {
      throw new Error('当前页面无法扫描。请打开招聘表单后重试。');
    }
    return response;
  }

  async function unlockedStatus(): Promise<ExtensionResponse> {
    const data = deps.session.requirePayload();
    return {
      ok: true,
      status: 'unlocked',
      profileName: data.masterProfile.name,
      variants: data.profileVariants.map((variant) => ({
        id: variant.id,
        name: variant.name,
      })),
    };
  }

  async function ensureOpen() {
    if (deps.session.getSnapshot().state === 'unlocked') return;
    const vault = await deps.repository.readVault();
    if (!vault) throw new Error('还没有本地保险库，请先打开设置页。');
    await deps.session.unlock(vault, await deps.secrets.getOrCreate());
    const migrated = migrateResumeData(deps.session.requirePayload());
    deps.session.replacePayload(migrated);
  }

  return async function handle(
    request: ExtensionRequest,
  ): Promise<ExtensionResponse> {
    try {
      if (request.type === 'offerNail:status') {
        const vault = await deps.repository.readVault();
        if (!vault) return { ok: true, status: 'uninitialized' };
        try {
          await ensureOpen();
          return unlockedStatus();
        } catch {
          return { ok: true, status: 'locked' };
        }
      }

      if (request.type === 'offerNail:lock') {
        await deps.session.lock();
        lastPlan = undefined;
        return { ok: true };
      }

      if (request.type === 'offerNail:reset') {
        await resetLocalData(
          deps.repository,
          deps.session,
          deps.secrets,
          deps.clearLlmConfig,
        );
        lastPlan = undefined;
        return { ok: true };
      }

      if (request.type === 'offerNail:replacePayload') {
        try {
          await ensureOpen();
          deps.session.replacePayload(request.data);
        } catch {
          // Options can persist first; the next status will open the vault.
        }
        return { ok: true };
      }

      if (request.type === 'offerNail:scan') {
        await ensureOpen();
        const data = resumeForFill(
          deps.session.requirePayload(),
          request.variantId,
        );
        const tabId = await deps.getActiveTabId();
        const collected = await collectFromTab(tabId);
        const rules = await deps.repository.listSiteRules();
        const plan = planPageFill(collected.collection, data, rules);
        lastPlan = { collection: collected.collection, plan };
        return { ok: true, items: plan.items, resume: data };
      }

      if (request.type === 'offerNail:confirmFill') {
        if (!lastPlan) return { ok: false, error: '请先扫描当前页面。' };
        const tabId = await deps.getActiveTabId();
        const fill = fillRequestFromPreview(request.items, lastPlan.plan);
        const applied = (await deps.sendToTab(tabId, {
          type: 'offerNail:applyFill',
          ...fill,
        })) as ExtensionResponse;
        if (!applied.ok || !('outcomes' in applied)) {
          return {
            ok: false,
            error:
              !applied.ok && 'error' in applied
                ? applied.error
                : '填写失败，页面未被提交。',
          };
        }
        const rules = rulesFromConfirmedFill(
          lastPlan.collection,
          request.items,
          lastPlan.plan.scored,
        );
        try {
          await Promise.all(
            rules.map((rule) => deps.repository.writeSiteRule(rule)),
          );
        } catch {
          // Filling succeeded; mapping persistence is best-effort.
        }
        return applied;
      }

      if (request.type === 'offerNail:undoFill') {
        const tabId = await deps.getActiveTabId();
        const undone = (await deps.sendToTab(tabId, {
          type: 'offerNail:undo',
        })) as ExtensionResponse;
        return undone.ok && 'undone' in undone
          ? undone
          : { ok: false, error: '当前没有可撤销的填写。' };
      }

      return { ok: false, error: '未知请求' };
    } catch (error) {
      if (error instanceof VaultLockedError) {
        return { ok: false, error: '请先打开本地保险库。' };
      }
      return {
        ok: false,
        error: error instanceof Error ? error.message : '操作失败',
      };
    }
  };
}
