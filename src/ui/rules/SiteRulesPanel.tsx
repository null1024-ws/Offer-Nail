import {
  fieldCatalog,
  isResumeFieldId,
} from '../../domain/resume/field-catalog';
import type { SiteMappingRule } from '../../page-mapping/rules';

export interface SiteRulesPanelProps {
  rules: SiteMappingRule[];
  onChange: (rules: SiteMappingRule[]) => Promise<void> | void;
}

export function SiteRulesPanel({ rules, onChange }: SiteRulesPanelProps) {
  if (rules.length === 0) {
    return (
      <section className="site-rules" aria-labelledby="site-rules-title">
        <h2 id="site-rules-title">网站映射规则</h2>
        <p>
          还没有保存的网站规则。在填写预览中修正映射后，可以保存到当前站点。
        </p>
      </section>
    );
  }

  return (
    <section className="site-rules" aria-labelledby="site-rules-title">
      <h2 id="site-rules-title">网站映射规则</h2>
      <p>规则只保存字段指纹和目标档案字段，不包含任何简历值。</p>
      <ul className="import-list">
        {rules.map((rule) => {
          const label = isResumeFieldId(rule.targetFieldId)
            ? fieldCatalog[rule.targetFieldId].label
            : rule.targetFieldId;
          return (
            <li key={rule.id}>
              <p>
                {rule.origin} → {label ?? rule.targetFieldId}
              </p>
              <p className="field-meta">
                {rule.enabled ? '已启用' : '已禁用'} · {rule.fieldFingerprint}
              </p>
              <div className="item-actions">
                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      rules.map((item) =>
                        item.id === rule.id
                          ? { ...item, enabled: !item.enabled }
                          : item,
                      ),
                    )
                  }
                >
                  {rule.enabled ? '禁用' : '重新启用'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onChange(rules.filter((item) => item.id !== rule.id))
                  }
                >
                  删除
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
