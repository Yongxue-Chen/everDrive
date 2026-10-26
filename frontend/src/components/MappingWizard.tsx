import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, FolderOpen, GripVertical, HardDrive, Lock, Network, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { createMappingTask, fetchCloudRemotes, listRcloneSources, testRcloneSource, updateMappingTask } from '../lib/api';
import { formatBytes, sizeToBytes, type SizeUnit } from '../lib/format';
import {
  describeSource,
  fallbackDestination,
  healthTone,
  roleLabels,
  strategyDescriptions,
  strategyLabels,
  syncModeDescriptions,
  syncModeLabels,
  type FlowModel,
  type Strategy
} from '../lib/mapping-view';
import type { MappingTaskItem } from '../lib/types';
import { errorText } from './feedback';
import { LocalPathPicker } from './LocalPathPicker';
import { MappingFlow } from './MappingFlow';
import { RcloneSourcePathPicker } from './RcloneSourcePathPicker';
import { Callout, Drawer } from './ui';

type Binding = { remoteId: string; remoteBasePath: string };

type FormState = {
  name: string;
  sourceType: 'local' | 'rclone';
  localPath: string;
  sourceRemoteName: string;
  sourcePath: string;
  strategy: Strategy;
  syncMode: 'archive' | 'mirror';
  encryptionEnabled: boolean;
  expectedSize: string;
  expectedUnit: SizeUnit;
  bindings: Binding[];
};

const emptyForm = (): FormState => ({
  name: '',
  sourceType: 'local',
  localPath: '',
  sourceRemoteName: '',
  sourcePath: '',
  strategy: 'single',
  syncMode: 'archive',
  encryptionEnabled: false,
  expectedSize: '',
  expectedUnit: 'TB',
  bindings: [{ remoteId: '', remoteBasePath: '' }]
});

function formFromItem(item: MappingTaskItem): FormState {
  return {
    name: item.name,
    sourceType: item.source_type ?? 'local',
    localPath: item.local_path,
    sourceRemoteName: item.source_remote_name ?? '',
    sourcePath: item.source_path ?? '',
    strategy: item.redundancy_enabled ? 'redundancy' : item.split_enabled ? 'split' : 'single',
    syncMode: item.sync_mode,
    encryptionEnabled: item.encryption_enabled,
    expectedSize: '',
    expectedUnit: 'TB',
    bindings: [...item.remotes].sort((a, b) => a.priority - b.priority).map((remote) => ({ remoteId: remote.remoteId, remoteBasePath: remote.remoteBasePath }))
  };
}

const STEPS = ['来源', '备份到', '同步方式', '确认'] as const;

export function MappingWizard({
  open,
  editing,
  onClose,
  onSaved
}: {
  open: boolean;
  editing: MappingTaskItem | null;
  onClose: () => void;
  onSaved: (name: string, isNew: boolean) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [step, setStep] = useState(0);
  const [localPickerOpen, setLocalPickerOpen] = useState(false);
  const [remotePickerOpen, setRemotePickerOpen] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const remotesQuery = useQuery({ queryKey: ['cloud-remotes'], queryFn: fetchCloudRemotes, enabled: open });
  const sourcesQuery = useQuery({ queryKey: ['rclone-sources'], queryFn: listRcloneSources, enabled: open });
  const sourceTest = useMutation({ mutationFn: () => testRcloneSource(form.sourceRemoteName, form.sourcePath) });

  useEffect(() => {
    if (!open) return;
    setForm(editing ? formFromItem(editing) : emptyForm());
    setStep(0);
    sourceTest.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const remotes = remotesQuery.data?.items ?? [];
  const sources = sourcesQuery.data?.items ?? [];
  const patch = (next: Partial<FormState>) => setForm((current) => ({ ...current, ...next }));
  const patchBinding = (index: number, next: Partial<Binding>) =>
    setForm((current) => ({ ...current, bindings: current.bindings.map((binding, i) => (i === index ? { ...binding, ...next } : binding)) }));
  const moveBinding = (from: number, to: number) =>
    setForm((current) => {
      if (to < 0 || to >= current.bindings.length) return current;
      const bindings = [...current.bindings];
      const [moved] = bindings.splice(from, 1);
      bindings.splice(to, 0, moved!);
      return { ...current, bindings };
    });

  const setStrategy = (strategy: Strategy) =>
    setForm((current) => {
      let bindings = current.bindings;
      if (strategy === 'single') bindings = bindings.slice(0, 1);
      else if (bindings.length < 2) bindings = [...bindings, { remoteId: '', remoteBasePath: '' }];
      return { ...current, strategy, bindings };
    });

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        localPath: form.localPath.trim(),
        sourceType: form.sourceType,
        sourceRemoteName: form.sourceType === 'rclone' ? form.sourceRemoteName : null,
        sourcePath: form.sourceType === 'rclone' ? form.sourcePath.trim() : '',
        syncMode: form.syncMode,
        encryptionEnabled: form.encryptionEnabled,
        redundancyEnabled: form.strategy === 'redundancy',
        splitEnabled: form.strategy === 'split',
        expectedDataSizeBytes: form.strategy === 'split' ? sizeToBytes(form.expectedSize, form.expectedUnit) || undefined : undefined,
        remoteBindings: form.bindings.map((binding, index) => ({
          remoteId: binding.remoteId,
          priority: index + 1,
          remoteBasePath: binding.remoteBasePath.trim()
        }))
      };
      return editing ? updateMappingTask(editing.id, body) : createMappingTask(body);
    },
    onSuccess: () => {
      onSaved(form.name.trim(), !editing);
      onClose();
    }
  });

  const stepErrors = useMemo(() => {
    const errors: string[][] = [[], [], [], []];
    if (!form.name.trim()) errors[0]!.push('请填写映射名称');
    if (form.sourceType === 'local' && !form.localPath) errors[0]!.push('请选择服务器目录');
    if (form.sourceType === 'rclone' && !form.sourceRemoteName) errors[0]!.push('请选择局域网来源');
    const ids = form.bindings.map((binding) => binding.remoteId);
    if (ids.some((id) => !id)) errors[1]!.push('每一行都需要选择云盘');
    if (new Set(ids).size !== ids.length) errors[1]!.push('同一个云盘不能重复绑定');
    if (form.strategy !== 'single' && form.bindings.length < 2) errors[1]!.push(`${strategyLabels[form.strategy]}至少需要 2 个云盘`);
    if (form.strategy === 'split' && form.expectedSize && !sizeToBytes(form.expectedSize, form.expectedUnit)) errors[2]!.push('预估数据量需要是正数');
    return errors;
  }, [form]);
  const firstInvalidStep = stepErrors.findIndex((errors) => errors.length > 0);
  const canEnter = (target: number) => editing !== null || firstInvalidStep === -1 || target <= firstInvalidStep;

  const preview: FlowModel = {
    id: 'preview',
    name: form.name || '未命名映射',
    source: describeSource(
      {
        source_type: form.sourceType,
        source_remote_name: form.sourceRemoteName || null,
        source_path: form.sourcePath,
        local_path: form.sourceType === 'local' && form.localPath ? form.localPath : '（未选择目录）'
      },
      sources
    ),
    strategy: form.strategy,
    syncMode: form.syncMode,
    encrypted: form.encryptionEnabled,
    targets: form.bindings
      .filter((binding) => binding.remoteId)
      .map((binding, index) => {
        const remote = remotes.find((item) => item.id === binding.remoteId);
        return {
          remoteId: binding.remoteId,
          displayName: remote?.displayName ?? binding.remoteId,
          remoteName: remote?.remoteName ?? '',
          role: form.strategy === 'split' ? 'shard' : index === 0 ? 'primary' : 'backup',
          path: fallbackDestination(remote?.remoteName ?? '?', remote?.remoteRootPath, binding.remoteBasePath),
          health: remote?.healthStatus ?? 'healthy',
          availableBytes: remote?.capacity.remainingCapacityBytes
        };
      })
  };

  const footer = (
    <>
      {save.error ? <p className="error drawer__error">{errorText(save.error, '保存映射失败')}</p> : null}
      <div className="drawer__foot-actions">
        <button onClick={step === 0 ? onClose : () => setStep(step - 1)}>{step === 0 ? '取消' : '上一步'}</button>
        {step < STEPS.length - 1 ? (
          <button className="button-primary" disabled={stepErrors[step]!.length > 0} onClick={() => setStep(step + 1)}>
            下一步
          </button>
        ) : (
          <button className="button-primary" disabled={firstInvalidStep !== -1 || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '正在保存...' : editing ? '保存修改' : '创建映射'}
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      <Drawer
        open={open}
        wide
        title={editing ? `编辑映射：${editing.name}` : '新建映射'}
        subtitle="选择要备份的目录、备份到哪些云盘，以及同步方式。"
        onClose={onClose}
        footer={footer}
      >
        <ol className="stepper">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                className={`stepper__item ${index === step ? 'stepper__item--current' : ''} ${index < step || (editing && stepErrors[index]!.length === 0) ? 'stepper__item--done' : ''}`}
                disabled={!canEnter(index)}
                onClick={() => setStep(index)}
              >
                <span className="stepper__dot">{index < step ? <Check size={12} /> : index + 1}</span>
                {label}
              </button>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <section className="wizard-step">
            <label className="field">
              <span>映射名称</span>
              <input autoFocus value={form.name} onChange={(event) => patch({ name: event.target.value })} placeholder="例如：家庭照片" />
            </label>

            <div className="field">
              <span>要备份的来源</span>
              <div className="choice-grid">
                <ChoiceCard
                  selected={form.sourceType === 'local'}
                  icon={<HardDrive size={18} />}
                  title="服务器本地目录"
                  description="备份这台服务器上挂载的文件夹"
                  onSelect={() =>
                    patch({
                      sourceType: 'local',
                      sourceRemoteName: '',
                      sourcePath: '',
                      localPath: form.localPath.startsWith('rclone://') ? '' : form.localPath
                    })
                  }
                />
                <ChoiceCard
                  selected={form.sourceType === 'rclone'}
                  icon={<Network size={18} />}
                  title="局域网 SMB/SFTP（只读）"
                  description="备份 NAS 或其他设备上的共享目录"
                  onSelect={() => patch({ sourceType: 'rclone' })}
                />
              </div>
            </div>

            {form.sourceType === 'local' ? (
              <label className="field">
                <span>服务器目录</span>
                <div className="path-input">
                  <input className="mono" value={form.localPath} readOnly placeholder="请选择服务器目录" onClick={() => setLocalPickerOpen(true)} />
                  <button onClick={() => setLocalPickerOpen(true)}>
                    <FolderOpen size={16} />
                    选择目录
                  </button>
                </div>
              </label>
            ) : (
              <>
                <label className="field">
                  <span>来源 remote</span>
                  <select value={form.sourceRemoteName} onChange={(event) => patch({ sourceRemoteName: event.target.value, sourcePath: '' })}>
                    <option value="">请选择 SMB/SFTP remote</option>
                    {sources.map((item) => (
                      <option key={item.name} value={item.name}>
                        {item.name}（{item.type.toUpperCase()}）
                      </option>
                    ))}
                  </select>
                </label>
                {!sourcesQuery.isLoading && sources.length === 0 ? (
                  <Callout tone="info" title="还没有可用的 SMB/SFTP 来源 remote">
                    <p>先在「连接」中新增 SMB/CIFS 或 SFTP remote，测试连接后再回到这里选择。</p>
                    <Link className="button-link" to="/rclone-config">
                      前往 rclone 配置
                    </Link>
                  </Callout>
                ) : null}
                <label className="field">
                  <span>来源目录</span>
                  <div className="path-input">
                    <input
                      className="mono"
                      value={form.sourcePath}
                      onChange={(event) => patch({ sourcePath: event.target.value })}
                      placeholder="留空表示根目录"
                    />
                    <button onClick={() => setRemotePickerOpen(true)} disabled={!form.sourceRemoteName}>
                      <FolderOpen size={16} />
                      选择目录
                    </button>
                  </div>
                </label>
                <Callout tone="warn" title="来源严格只读">
                  <p>归档和镜像都不会修改 SMB/SFTP 来源；镜像只影响目标云盘。</p>
                  <div className="inline-actions">
                    <button onClick={() => sourceTest.mutate()} disabled={!form.sourceRemoteName || sourceTest.isPending}>
                      {sourceTest.isPending ? '测试中...' : '测试来源连接'}
                    </button>
                    {sourceTest.data ? <span className="text-good">连接正常</span> : null}
                    {sourceTest.error ? <span className="text-bad">{errorText(sourceTest.error, '连接失败')}</span> : null}
                  </div>
                </Callout>
              </>
            )}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="wizard-step">
            <div className="field">
              <span>备份策略</span>
              <div className="choice-grid choice-grid--3">
                {(['single', 'redundancy', 'split'] as const).map((strategy) => (
                  <ChoiceCard
                    key={strategy}
                    selected={form.strategy === strategy}
                    title={strategyLabels[strategy]}
                    description={strategyDescriptions[strategy]}
                    onSelect={() => setStrategy(strategy)}
                  />
                ))}
              </div>
            </div>

            <div className="field">
              <span>目标云盘{form.strategy === 'redundancy' ? '（第一个为主盘，可拖动调整顺序）' : form.strategy === 'split' ? '（顺序仅用于展示）' : ''}</span>
              {remotesQuery.data && remotes.length === 0 ? (
                <Callout tone="warn" title="当前没有可绑定的云盘">
                  <p>请先在「云盘」页面新增业务云盘。</p>
                  <Link className="button-link" to="/cloud-remotes">
                    前往云盘
                  </Link>
                </Callout>
              ) : null}
              <div className="binding-list">
                {form.bindings.map((binding, index) => {
                  const remote = remotes.find((item) => item.id === binding.remoteId);
                  const role = form.strategy === 'split' ? 'shard' : index === 0 ? 'primary' : 'backup';
                  return (
                    <div
                      key={index}
                      className={`binding-card ${dragIndex === index ? 'binding-card--dragging' : ''}`}
                      draggable={form.bindings.length > 1}
                      onDragStart={() => setDragIndex(index)}
                      onDragEnd={() => setDragIndex(null)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        if (dragIndex !== null && dragIndex !== index) {
                          moveBinding(dragIndex, index);
                          setDragIndex(index);
                        }
                      }}
                    >
                      <div className="binding-card__head">
                        {form.bindings.length > 1 ? <GripVertical size={16} className="binding-card__grip" /> : null}
                        <span className={`role-badge role-badge--${role}`}>
                          {roleLabels[role]}
                          {role === 'shard' ? ` ${index + 1}` : ''}
                        </span>
                        <div className="binding-card__tools">
                          <button
                            className="icon-button icon-button--sm"
                            aria-label="上移"
                            disabled={index === 0}
                            onClick={() => moveBinding(index, index - 1)}
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            className="icon-button icon-button--sm"
                            aria-label="下移"
                            disabled={index === form.bindings.length - 1}
                            onClick={() => moveBinding(index, index + 1)}
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            className="icon-button icon-button--sm icon-button--danger"
                            aria-label="移除"
                            disabled={form.bindings.length === 1}
                            onClick={() => setForm((current) => ({ ...current, bindings: current.bindings.filter((_, i) => i !== index) }))}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="binding-card__fields">
                        <label className="field">
                          <span>云盘</span>
                          <select value={binding.remoteId} onChange={(event) => patchBinding(index, { remoteId: event.target.value })}>
                            <option value="">请选择云盘</option>
                            {remotes.map((item) => (
                              <option
                                key={item.id}
                                value={item.id}
                                disabled={item.id !== binding.remoteId && form.bindings.some((other) => other.remoteId === item.id)}
                              >
                                {item.displayName} · 剩余 {formatBytes(item.capacity.remainingCapacityBytes)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>云盘内子目录</span>
                          <input
                            className="mono"
                            value={binding.remoteBasePath}
                            onChange={(event) => patchBinding(index, { remoteBasePath: event.target.value })}
                            placeholder="例如 backup/photos，留空为根目录"
                          />
                        </label>
                      </div>
                      {remote ? (
                        <div className="binding-card__dest">
                          <span className={`dot dot--${healthTone(remote.healthStatus)}`} />
                          实际写入：<span className="mono">{fallbackDestination(remote.remoteName, remote.remoteRootPath, binding.remoteBasePath)}</span>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {form.strategy !== 'single' ? (
                <button
                  className="button-dashed"
                  disabled={form.bindings.length >= remotes.length}
                  onClick={() => setForm((current) => ({ ...current, bindings: [...current.bindings, { remoteId: '', remoteBasePath: '' }] }))}
                >
                  <Plus size={16} />
                  添加云盘
                </button>
              ) : null}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="wizard-step">
            <div className="field">
              <span>同步方式</span>
              <div className="choice-grid">
                {(['archive', 'mirror'] as const).map((mode) => (
                  <ChoiceCard
                    key={mode}
                    selected={form.syncMode === mode}
                    tone={mode === 'mirror' ? 'warn' : undefined}
                    title={syncModeLabels[mode]}
                    description={syncModeDescriptions[mode]}
                    onSelect={() => patch({ syncMode: mode })}
                  />
                ))}
              </div>
              {form.syncMode === 'mirror' ? (
                <Callout tone="warn">镜像模式下，来源中删除的文件也会从云端删除。如需保留误删文件，可在「云盘」中为目标云盘开启自建云端回收站。</Callout>
              ) : null}
            </div>

            <label className="toggle-card">
              <input type="checkbox" checked={form.encryptionEnabled} onChange={(event) => patch({ encryptionEnabled: event.target.checked })} />
              <span className="toggle-card__icon">
                <Lock size={18} />
              </span>
              <span>
                <strong>启用加密</strong>
                <small>上传前在服务器端加密，云盘只能看到密文。恢复依赖服务器的 ENCRYPTION_MASTER_KEY，请妥善备份。</small>
              </span>
            </label>

            {form.strategy === 'split' ? (
              <label className="field">
                <span>预估数据量（可选，用于校验各云盘总容量是否足够）</span>
                <div className="unit-input">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={form.expectedSize}
                    onChange={(event) => patch({ expectedSize: event.target.value })}
                    placeholder="例如 2.5"
                  />
                  <select value={form.expectedUnit} onChange={(event) => patch({ expectedUnit: event.target.value as SizeUnit })}>
                    <option value="GB">GB</option>
                    <option value="TB">TB</option>
                  </select>
                </div>
              </label>
            ) : null}
            {stepErrors[2]!.map((error) => (
              <p className="error" key={error}>
                {error}
              </p>
            ))}
          </section>
        ) : null}

        {step === 3 ? (
          <section className="wizard-step">
            <Callout tone="info" title={`「${preview.name}」将按如下方式备份`} />
            <MappingFlow flow={preview} />
            <dl className="summary-list">
              <div>
                <dt>备份策略</dt>
                <dd>{strategyLabels[form.strategy]}</dd>
              </div>
              <div>
                <dt>同步方式</dt>
                <dd>
                  {syncModeLabels[form.syncMode]} — {syncModeDescriptions[form.syncMode]}
                </dd>
              </div>
              <div>
                <dt>加密</dt>
                <dd>{form.encryptionEnabled ? '已启用' : '未启用'}</dd>
              </div>
            </dl>
          </section>
        ) : null}

        {step < 3 && stepErrors[step]!.length > 0 && step !== 2 ? <p className="muted wizard-hint">{stepErrors[step]!.join('；')}</p> : null}
      </Drawer>

      <LocalPathPicker
        isOpen={localPickerOpen}
        selectedPath={form.localPath}
        onClose={() => setLocalPickerOpen(false)}
        onSelect={(path) => patch({ localPath: path })}
      />
      <RcloneSourcePathPicker
        isOpen={remotePickerOpen}
        remoteName={form.sourceRemoteName}
        selectedPath={form.sourcePath}
        onClose={() => setRemotePickerOpen(false)}
        onSelect={(path) => patch({ sourcePath: path })}
      />
    </>
  );
}

function ChoiceCard({
  selected,
  title,
  description,
  icon,
  tone,
  onSelect
}: {
  selected: boolean;
  title: string;
  description: string;
  icon?: ReactNode;
  tone?: 'warn';
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`choice-card ${selected ? 'choice-card--selected' : ''} ${tone ? `choice-card--${tone}` : ''}`}
      onClick={onSelect}
    >
      <span className="choice-card__title">
        {icon}
        {title}
        <span className="choice-card__check">{selected ? <Check size={14} /> : null}</span>
      </span>
      <span className="choice-card__desc">{description}</span>
    </button>
  );
}
