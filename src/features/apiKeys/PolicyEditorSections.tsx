import { useMemo } from 'react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type { ApiKeyGroupView } from '@/services/api/apiKeyGroups';
import {
  CLAUDE_CODE_ONLY_MODE_OPTIONS,
  CODEX_CHANNEL_MODE_OPTIONS,
  EXPIRY_PRESET_OPTIONS,
  FAMILY_OPTIONS,
  type PolicyDraft,
  addExpiryPreset,
  formatCost,
  formatDateTime,
  listFromLines,
  normalizeHourInputValue,
  resolveExpiryPreset,
} from './policyDraft';
import styles from './apiKeys.module.scss';

export type PolicyEditorSectionsProps = {
  draft: PolicyDraft;
  onDraftChange: <K extends keyof PolicyDraft>(key: K, value: PolicyDraft[K]) => void;
  groups: ApiKeyGroupView[];
  activeGroup: ApiKeyGroupView | null;
};

/**
 * PolicyEditorSections renders the four-block editor body that was
 * previously inlined in the monolithic workbench page. It is pure —
 * all state lives in the parent edit page.
 */
export function PolicyEditorSections({
  draft,
  onDraftChange,
  groups,
  activeGroup,
}: PolicyEditorSectionsProps) {
  const expiryPreset = useMemo(() => resolveExpiryPreset(draft.expiresAt), [draft.expiresAt]);
  const groupOptions = useMemo(
    () => [
      { value: '', label: '不绑定账户组' },
      ...groups.map((item) => ({
        value: item.id,
        label: `${item.name} · 日 $${item.daily_budget_usd} / 周 $${item.weekly_budget_usd}`,
      })),
    ],
    [groups]
  );
  const groupManagedBudget = Boolean(draft.groupId.trim());

  return (
    <div className={styles.editorSections}>
      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <div>
            <span className={styles.sectionKicker}>基础信息</span>
            <h4>身份、归属与上游入口</h4>
          </div>
          <p>先确认这把 key 自身是谁、归属哪个账户组，以及是否走单独的上游地址。</p>
        </div>

        <div className={styles.sectionGrid}>
          <Input
            label="API Key"
            value={draft.apiKey}
            onChange={(event) => onDraftChange('apiKey', event.target.value)}
            placeholder="输入 API Key"
          />
          <Input
            label="名称"
            value={draft.name}
            onChange={(event) => onDraftChange('name', event.target.value)}
            placeholder="可选"
          />
          <Input
            label="备注"
            value={draft.note}
            onChange={(event) => onDraftChange('note', event.target.value)}
            placeholder="可选"
          />
          <Input
            label="创建时间"
            value={formatDateTime(draft.createdAt)}
            disabled
            hint="创建后由后端写入，当前字段只读。"
          />
          <div className="form-group">
            <label>账户组</label>
            <Select
              value={draft.groupId}
              options={groupOptions}
              onChange={(value) => onDraftChange('groupId', value)}
            />
            <div className="hint">
              {activeGroup
                ? `当前组 ${activeGroup.name}：日额度 ${formatCost(activeGroup.daily_budget_usd)}，周额度 ${formatCost(activeGroup.weekly_budget_usd)}。`
                : '未绑定账户组时，下面的日/周预算按 API Key 单独生效。'}
            </div>
          </div>
          <Input
            label="Upstream Base URL"
            value={draft.upstreamBaseUrl}
            onChange={(event) => onDraftChange('upstreamBaseUrl', event.target.value)}
            placeholder="可选"
          />
          <div className="form-group">
            <label>过期时间</label>
            <Select
              value={expiryPreset}
              options={EXPIRY_PRESET_OPTIONS}
              onChange={(value) => {
                if (value === 'custom') return;
                onDraftChange('expiresAt', addExpiryPreset(value));
              }}
            />
            <div className="hint">新建 API Key 默认有效期 1 个月；也可以改成不过期。</div>
          </div>
          <Input
            label="自定义过期时间"
            type="datetime-local"
            value={draft.expiresAt}
            onChange={(event) => onDraftChange('expiresAt', event.target.value)}
            hint="可直接选择具体过期日期时间。留空表示不过期。"
          />
        </div>
        <div className={styles.toggleGrid}>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={!draft.disabled}
              onChange={(value) => onDraftChange('disabled', !value)}
              label="Key 启用"
            />
            <p>关闭后该 API Key 会立即停止服务，但仍保留在工作台中。</p>
          </div>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={draft.allowClaudeFamily}
              onChange={(value) => onDraftChange('allowClaudeFamily', value)}
              label="允许 Claude 系模型"
            />
            <p>控制客户端请求的 `claude-*` 模型族是否可用。</p>
          </div>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={draft.allowGptFamily}
              onChange={(value) => onDraftChange('allowGptFamily', value)}
              label="允许 GPT 系模型"
            />
            <p>控制客户端请求的 `gpt-* / chatgpt-* / o1/o3/o4` 模型族是否可用。</p>
          </div>
        </div>
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <div>
            <span className={styles.sectionKicker}>路由策略</span>
            <h4>模型家族与运行开关</h4>
          </div>
          <p>把模型映射和行为开关放在一起看，避免在不同区域来回切换判断。</p>
        </div>

        <div className={styles.sectionGrid}>
          <div className="form-group">
            <label>Claude 转 GPT 家族</label>
            <Select
              value={draft.claudeGptTargetFamily}
              options={FAMILY_OPTIONS}
              onChange={(value) => onDraftChange('claudeGptTargetFamily', value)}
            />
          </div>
          <div className="form-group">
            <label>客户端限制</label>
            <Select
              value={draft.claudeCodeOnlyMode}
              options={CLAUDE_CODE_ONLY_MODE_OPTIONS}
              onChange={(value) =>
                onDraftChange('claudeCodeOnlyMode', value as PolicyDraft['claudeCodeOnlyMode'])
              }
            />
            <div className="hint">
              继承全局时跟随系统页总开关；也可以对当前 API Key 单独强制为“仅允许 Claude
              Code”或关闭限制。
            </div>
          </div>
          <div className="form-group">
            <label>Codex 渠道</label>
            <Select
              value={draft.codexChannelMode}
              options={CODEX_CHANNEL_MODE_OPTIONS}
              onChange={(value) =>
                onDraftChange('codexChannelMode', value as PolicyDraft['codexChannelMode'])
              }
            />
            <div className="hint">
              `auto` 保持当前默认行为；也可以把当前 API Key 固定到 AI Provider 或 Codex auth file。
            </div>
          </div>
        </div>

        <div className={styles.toggleGrid}>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={draft.fastMode}
              onChange={(value) => onDraftChange('fastMode', value)}
              label="Fast Mode"
            />
            <p>优先使用更激进的路由路径，适合更看重速度的场景。</p>
          </div>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={!draft.sessionTrajectoryDisabled}
              onChange={(value) => onDraftChange('sessionTrajectoryDisabled', !value)}
              label="记录 Session 会话"
            />
            <p>
              关闭后，这把 API Key 的新请求不会写入 session
              trajectory；全局总开关仍在会话轨迹页控制。
            </p>
          </div>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={draft.enableClaudeModels}
              onChange={(value) => onDraftChange('enableClaudeModels', value)}
              label="允许 Claude 原生模型"
            />
            <p>开启后可直接命中 Claude 原生模型，而不是全部转为 GPT 家族。</p>
          </div>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={draft.claudeGlobalFallbackEnabled}
              onChange={(value) => onDraftChange('claudeGlobalFallbackEnabled', value)}
              disabled={!draft.enableClaudeModels}
              label="Claude 失败走全局兜底"
            />
            <p>原生 Claude 调用失败后，直接按系统页的全局 Claude 转 GPT 配置重试。</p>
          </div>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={draft.enableClaudeOpus1M}
              onChange={(value) => onDraftChange('enableClaudeOpus1M', value)}
              label="允许 Claude Opus 1M"
            />
            <p>按需开放高上下文版本，避免默认对所有 key 暴露高成本能力。</p>
          </div>
          <div className={styles.toggleCard}>
            <ToggleSwitch
              checked={draft.allowClaudeOpus46}
              onChange={(value) => onDraftChange('allowClaudeOpus46', value)}
              label="允许 Claude Opus 4.6"
            />
            <p>独立控制 4.6 可用性，便于灰度和高成本模型限制。</p>
          </div>
        </div>
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <div>
            <span className={styles.sectionKicker}>预算与周期</span>
            <h4>累计预算、日预算、周期预算与 Token 包</h4>
          </div>
          <p>把所有会影响费用控制的字段聚合在一个区块里，方便整体检查预算边界。</p>
        </div>

        {activeGroup && (
          <div className={styles.groupBindingNote}>
            <strong>账户组预算已接管基础额度</strong>
            <span>
              该 API Key 当前归属于 {activeGroup.name}
              。请求会先消耗账户组的日/周基础额度，再在基础额度耗尽后消耗 Token
              包；周期锚点仍可按当前 key 单独配置。
            </span>
          </div>
        )}

        <div className={styles.sectionGrid}>
          <Input
            label="Claude 累计预算 USD"
            type="number"
            min="0"
            step="0.01"
            value={draft.claudeUsageLimitUsd}
            onChange={(event) => onDraftChange('claudeUsageLimitUsd', event.target.value)}
          />
          <Input
            label="每日预算 USD"
            type="number"
            min="0"
            step="0.01"
            value={draft.dailyBudgetUsd}
            onChange={(event) => onDraftChange('dailyBudgetUsd', event.target.value)}
            disabled={groupManagedBudget}
            hint={groupManagedBudget ? '已绑定账户组，基础日预算由账户组统一控制。' : undefined}
          />
          <Input
            label="每周期预算 USD"
            type="number"
            min="0"
            step="0.01"
            value={draft.weeklyBudgetUsd}
            onChange={(event) => onDraftChange('weeklyBudgetUsd', event.target.value)}
            disabled={groupManagedBudget}
            hint={groupManagedBudget ? '已绑定账户组，基础周预算由账户组统一控制。' : undefined}
          />
          <Input
            label="周期锚点"
            type="datetime-local"
            value={draft.weeklyBudgetAnchorAt}
            step="3600"
            onChange={(event) => onDraftChange('weeklyBudgetAnchorAt', event.target.value)}
            onBlur={(event) =>
              onDraftChange(
                'weeklyBudgetAnchorAt',
                event.target.value ? normalizeHourInputValue(event.target.value) : ''
              )
            }
            hint="优先使用周期锚点；留空时回退到创建时间。"
          />
          <Input
            label="Token 包 USD"
            type="number"
            min="0"
            step="0.01"
            value={draft.tokenPackageUsd}
            onChange={(event) => onDraftChange('tokenPackageUsd', event.target.value)}
          />
          <Input
            label="Token 包开始时间"
            type="datetime-local"
            value={draft.tokenPackageStartedAt}
            onChange={(event) => onDraftChange('tokenPackageStartedAt', event.target.value)}
          />
        </div>
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <div>
            <span className={styles.sectionKicker}>高级规则</span>
            <h4>限额、禁止模型与 JSON 规则</h4>
          </div>
          <p>把高复杂度配置放在最后，先完成基础策略，再补充精细化限制。</p>
        </div>

        <div className={styles.textAreaGrid}>
          <label className={styles.textAreaField}>
            <span>每日模型限额</span>
            <textarea
              value={draft.dailyLimits}
              onChange={(event) => onDraftChange('dailyLimits', event.target.value)}
              placeholder={'gpt-5.5=120\nclaude-sonnet-4-6=40'}
            />
          </label>
          <label className={styles.textAreaField}>
            <span>Model Routing Rules JSON</span>
            <textarea
              value={draft.modelRoutingRules}
              onChange={(event) => onDraftChange('modelRoutingRules', event.target.value)}
            />
          </label>
        </div>
        {draft.excludedModels.trim() && (
          <div className={styles.groupBindingNote}>
            <strong>存在额外禁止模型规则</strong>
            <span>
              当前记录里还有 {listFromLines(draft.excludedModels).length}
              条额外禁止模型规则，页面会自动保留并随保存一起回写。
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
