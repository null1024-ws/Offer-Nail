import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import {
  applyProfileDraft,
  resumeDataToProfileDraft,
  type ResumeData,
} from '../../src/domain/resume';
import { ImportReview } from '../../src/ui/import/ImportReview';
import { Onboarding } from '../../src/ui/onboarding/Onboarding';
import { Unlock } from '../../src/ui/onboarding/Unlock';
import { ProfileEditor } from '../../src/ui/profile/ProfileEditor';
import { SiteRulesPanel } from '../../src/ui/rules/SiteRulesPanel';
import { VariantManager } from '../../src/ui/variants/VariantManager';
import { VaultBackup } from '../../src/ui/vault/VaultBackup';
import {
  extractDocxText,
  extractPdfText,
  parseResumeCandidates,
  sourceLinesFromDocx,
  sourceLinesFromPdf,
  type FieldCandidate,
  type SourceLine,
} from '../../src/parser';
import { initializeNewVault } from '../../src/vault/initialize';
import { saveProfile, unlockProfile } from '../../src/vault/profile-vault';
import {
  VaultRepository,
  type StoredSiteRule,
} from '../../src/vault/repository';
import './style.css';

const repository = new VaultRepository();

function Options() {
  const [state, setState] = useState<
    'loading' | 'uninitialized' | 'locked' | 'editing' | 'error'
  >('loading');
  const [resumeData, setResumeData] = useState<ResumeData>();
  const [password, setPassword] = useState('');
  const [siteRules, setSiteRules] = useState<StoredSiteRule[]>([]);

  useEffect(() => {
    void repository
      .readVault()
      .then((vault) => setState(vault ? 'locked' : 'uninitialized'))
      .catch(() => setState('error'));
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
        onInitialize={async ({ password, profileName }) => {
          const created = await initializeNewVault(
            repository,
            password,
            profileName,
          );
          setPassword(password);
          setResumeData(created);
          setSiteRules(await repository.listSiteRules());
          setState('editing');
        }}
      />
    );
  }

  if (state === 'locked') {
    return (
      <Unlock
        onUnlock={async (nextPassword) => {
          const unlocked = await unlockProfile(repository, nextPassword);
          setPassword(nextPassword);
          setResumeData(unlocked);
          setSiteRules(await repository.listSiteRules());
          setState('editing');
        }}
      />
    );
  }

  if (state === 'editing' && resumeData) {
    const persist = async (updated: ResumeData) => {
      await saveProfile(repository, updated, password);
      setResumeData(updated);
      void browser.runtime.sendMessage({
        type: 'offerNail:replacePayload',
        data: updated,
      });
    };
    return (
      <div className="options-shell">
        <ResumeImport resume={resumeData} onApply={persist} />
        <VaultBackup
          repository={repository}
          session={{
            lock: async () => {
              await browser.runtime.sendMessage({ type: 'offerNail:lock' });
            },
          }}
          password={password}
          onRestored={async (restored) => {
            setResumeData(restored);
            void browser.runtime.sendMessage({
              type: 'offerNail:replacePayload',
              data: restored,
            });
          }}
          onReset={() => {
            setPassword('');
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
}: {
  resume: ResumeData;
  onApply: (next: ResumeData) => Promise<void>;
}) {
  const [review, setReview] = useState<{
    candidates: FieldCandidate[];
    unmapped: SourceLine[];
  }>();
  const [error, setError] = useState<string>();

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
        选择本地 PDF 或 DOCX。解析只在此设备完成，未确认的候选不会写入档案。
      </p>
      <input
        type="file"
        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setError(undefined);
          try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const isPdf =
              file.type === 'application/pdf' ||
              file.name.toLowerCase().endsWith('.pdf');
            const parsed = isPdf
              ? parseResumeCandidates(
                  sourceLinesFromPdf((await extractPdfText(bytes)).blocks),
                )
              : parseResumeCandidates(
                  sourceLinesFromDocx((await extractDocxText(bytes)).blocks),
                );
            setReview(parsed);
          } catch (cause) {
            setError(
              cause instanceof Error
                ? cause.message
                : '导入失败，文件不会被保留。',
            );
          }
        }}
      />
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
