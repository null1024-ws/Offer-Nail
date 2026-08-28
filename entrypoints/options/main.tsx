import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  applyProfileDraft,
  resumeDataToProfileDraft,
  type ResumeData,
} from '../../src/domain/resume';
import { ImportReview } from '../../src/ui/import/ImportReview';
import { Onboarding } from '../../src/ui/onboarding/Onboarding';
import { ProfileEditor } from '../../src/ui/profile/ProfileEditor';
import { SiteRulesPanel } from '../../src/ui/rules/SiteRulesPanel';
import { VariantManager } from '../../src/ui/variants/VariantManager';
import { VaultBackup } from '../../src/ui/vault/VaultBackup';
import {
  parseResumeImportWithText,
  type FieldCandidate,
  type SourceLine,
} from '../../src/parser';
import {
  BrowserLlmConfigStore,
  extractResumeWithLlm,
  mergeCandidates,
  type LlmConfig,
} from '../../src/llm';
import { LlmSettings } from '../../src/ui/llm/LlmSettings';
import { initializeNewVault } from '../../src/vault/initialize';
import { saveProfile, unlockProfile } from '../../src/vault/profile-vault';
import { resetLocalData } from '../../src/vault/backup';
import {
  VaultRepository,
  type StoredSiteRule,
} from '../../src/vault/repository';
import { BrowserDeviceSecretStore } from '../../src/vault/device-secret';
import './style.css';

const repository = new VaultRepository();
const secrets = new BrowserDeviceSecretStore();
const llmStore = new BrowserLlmConfigStore(secrets);

function Options() {
  const [state, setState] = useState<
    'loading' | 'uninitialized' | 'locked' | 'editing' | 'error'
  >('loading');
  const [resumeData, setResumeData] = useState<ResumeData>();
  const [siteRules, setSiteRules] = useState<StoredSiteRule[]>([]);
  const [confirmReset, setConfirmReset] = useState(false);
  const [llmConfig, setLlmConfig] = useState<LlmConfig>();
  const [llmApiKey, setLlmApiKey] = useState<string>();

  useEffect(() => {
    void (async () => {
      try {
        const vault = await repository.readVault();
        if (!vault) {
          setState('uninitialized');
          return;
        }
        try {
          const data = await unlockProfile(repository, secrets);
          setResumeData(data);
          setSiteRules(await repository.listSiteRules());
          setLlmConfig(await llmStore.read());
          setLlmApiKey(await llmStore.readApiKey());
          setState('editing');
        } catch {
          setState('locked');
        }
      } catch {
        setState('error');
      }
    })();
  }, []);

  if (state === 'loading') {
    return (
      <main>
        <p className="eyebrow">Offer-Nail</p>
        <h1>正在检查本地保险库…</h1>
      </main>
    );
  }

  if (state === 'uninitialized') {
    return (
      <Onboarding
        onInitialize={async ({ profileName }) => {
          const created = await initializeNewVault(
            repository,
            secrets,
            profileName,
          );
          setResumeData(created);
          setSiteRules(await repository.listSiteRules());
          setState('editing');
        }}
      />
    );
  }

  if (state === 'locked') {
    return (
      <main>
        <p className="eyebrow">Offer-Nail</p>
        <h1>无法打开现有档案</h1>
        <p className="lead">
          本地数据无法自动读取。可以清除后重新创建空白档案，全程不需要密码。
        </p>
        <label className="inline-check">
          <input
            type="checkbox"
            checked={confirmReset}
            onChange={(event) => setConfirmReset(event.target.checked)}
          />
          我确认要彻底删除无法打开的本地数据
        </label>
        <button
          type="button"
          disabled={!confirmReset}
          onClick={async () => {
            await resetLocalData(
              repository,
              {
                lock: async () => {
                  await browser.runtime.sendMessage({ type: 'offerNail:lock' });
                },
              },
              secrets,
            );
            setConfirmReset(false);
            setResumeData(undefined);
            setSiteRules([]);
            setState('uninitialized');
          }}
        >
          清除并重新开始
        </button>
      </main>
    );
  }

  if (state === 'editing' && resumeData) {
    const persist = async (updated: ResumeData) => {
      await saveProfile(repository, updated, secrets);
      setResumeData(updated);
      void browser.runtime.sendMessage({
        type: 'offerNail:replacePayload',
        data: updated,
      });
    };
    return (
      <div className="options-shell">
        <header className="page-head">
          <p className="eyebrow">Offer-Nail</p>
          <p className="lead">简历只留本机。只填写，不代交。</p>
        </header>
        <ResumeImport
          resume={resumeData}
          onApply={persist}
          llm={
            llmConfig?.enabled && llmApiKey
              ? { apiKey: llmApiKey, model: llmConfig.model }
              : undefined
          }
        />
        <LlmSettings
          store={llmStore}
          config={llmConfig}
          hasApiKey={Boolean(llmApiKey)}
          onSaved={async (next, hasKey) => {
            setLlmConfig(next);
            setLlmApiKey(hasKey ? await llmStore.readApiKey() : undefined);
          }}
        />
        <VaultBackup
          repository={repository}
          session={{
            lock: async () => {
              await browser.runtime.sendMessage({ type: 'offerNail:lock' });
            },
          }}
          secrets={secrets}
          onRestored={async (restored) => {
            setResumeData(restored);
            void browser.runtime.sendMessage({
              type: 'offerNail:replacePayload',
              data: restored,
            });
          }}
          onReset={() => {
            setResumeData(undefined);
            setSiteRules([]);
            setState('uninitialized');
          }}
        />
        <SiteRulesPanel
          rules={siteRules}
          onChange={async (next) => {
            const current = await repository.listSiteRules();
            await Promise.all(
              current
                .filter((rule) => !next.some((item) => item.id === rule.id))
                .map((rule) => repository.deleteSiteRule(rule.id)),
            );
            await Promise.all(
              next.map((rule) =>
                repository.writeSiteRule({
                  ...rule,
                  origin: rule.origin,
                }),
              ),
            );
            setSiteRules(await repository.listSiteRules());
          }}
        />
        <VariantManager value={resumeData} onChange={persist} />
        <ProfileEditor
          key={resumeData.masterProfile.updatedAt}
          initialValue={resumeDataToProfileDraft(resumeData)}
          onSave={(draft) => persist(applyProfileDraft(resumeData, draft))}
        />
      </div>
    );
  }

  return (
    <main>
      <p className="eyebrow">Offer-Nail</p>
      <h1>无法读取保险库</h1>
      <p>读取本地数据失败，请刷新页面后重试。</p>
    </main>
  );
}

function ResumeImport({
  resume,
  onApply,
  llm,
}: {
  resume: ResumeData;
  onApply: (next: ResumeData) => Promise<void>;
  llm?: { apiKey: string; model: string };
}) {
  const [review, setReview] = useState<{
    candidates: FieldCandidate[];
    unmapped: SourceLine[];
  }>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  if (review) {
    return (
      <ImportReview
        resume={resume}
        candidates={review.candidates}
        unmapped={review.unmapped}
        onCancel={() => setReview(undefined)}
        onApply={async (next) => {
          await onApply(next);
          setReview(undefined);
        }}
      />
    );
  }

  return (
    <section className="resume-import" aria-labelledby="import-entry-title">
      <h2 id="import-entry-title">导入简历</h2>
      <p>
        选择本地 PDF、DOCX
        或图片。解析和文字识别只在此设备完成
        {llm ? '，并会用 AI 辅助提取更丰富的字段' : ''}
        ；未确认的候选不会写入档案。
      </p>
      <input
        type="file"
        accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp"
        disabled={busy}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setError(undefined);
          setBusy(true);
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const parsed = await parseResumeImportWithText(
              bytes,
              file.name,
              file.type,
            );
            if (llm) {
              try {
                const llmCandidates = await extractResumeWithLlm(
                  parsed.fullText,
                  { apiKey: llm.apiKey, model: llm.model },
                );
                setReview({
                  candidates: mergeCandidates(
                    parsed.candidates,
                    llmCandidates,
                  ),
                  unmapped: parsed.unmapped,
                });
              } catch (cause) {
                setError(
                  cause instanceof Error
                    ? `AI 辅助识别失败，已改用本地解析：${cause.message}`
                    : 'AI 辅助识别失败，已改用本地解析。',
                );
                setReview({
                  candidates: parsed.candidates,
                  unmapped: parsed.unmapped,
                });
              }
            } else {
              setReview({
                candidates: parsed.candidates,
                unmapped: parsed.unmapped,
              });
            }
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : '导入失败，文件不会被保留。',
            );
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && (
        <p className="hint">
          正在本地解析
          {llm ? '，并用 AI 辅助识别' : ''}
          。扫描件或图片可能需要更长时间…
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>,
);
