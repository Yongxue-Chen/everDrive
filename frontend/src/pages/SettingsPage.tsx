import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { errorText, useFeedback } from '../components/feedback';
import { Callout, PageHeader, Tabs } from '../components/ui';
import { fetchSettings, getApiMode, setApiMode, updateSettings } from '../lib/api';
import type { ApiMode } from '../lib/types';

type FormState = {
  rcloneUrl: string;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
  scanInterval: number;
  syncConcurrency: number;
  rcloneConcurrency: number;
  jobLong: number;
  jobShort: number;
  jobRemoteLimit: number;
  warningThreshold: number;
  hashAlgorithm: string;
  logLevel: string;
  syncTransfers: number;
  syncCheckers: number;
  syncBufferSizeMiB: number;
  syncTpsLimit: number;
  syncBwLimitMiB: number;
  cloudTrashRetentionDays: number;
  cloudTrashCleanupIntervalHours: number;
  cloudTrashMaxDeleteBatchPerRun: number;
};

type NumberKey = { [K in keyof FormState]: FormState[K] extends number ? K : never }[keyof FormState];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="settings-section__intro">
        <h3>{title}</h3>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      <div className="settings-section__fields">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { toast } = useFeedback();
  const [mode, setMode] = useState<ApiMode>(getApiMode());
  const query = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (response) => {
      const restart = response.item.hotUpdate.restartRequiredKeys;
      toast('success', '设置已保存', restart.length ? `以下设置需要重启后生效：${restart.join(', ')}` : '已立即生效。');
      void query.refetch();
    },
    onError: (error) => toast('error', '更新设置失败', errorText(error, ''))
  });

  const values = query.data?.item.values;
  const [form, setForm] = useState<FormState | null>(null);

  useEffect(() => {
    const onModeChanged = (event: Event) => setMode((event as CustomEvent<ApiMode>).detail);
    window.addEventListener('everdrive_api_mode_changed', onModeChanged);
    return () => window.removeEventListener('everdrive_api_mode_changed', onModeChanged);
  }, []);

  useEffect(() => {
    if (!values) return;
    setForm({
      rcloneUrl: values.rcloneRcd.url,
      timeoutMs: values.rcloneRcd.timeoutMs,
      retryAttempts: values.rcloneRcd.retryAttempts,
      retryDelayMs: values.rcloneRcd.retryDelayMs,
      scanInterval: values.defaultScanIntervalSeconds,
      syncConcurrency: values.defaultConcurrency.sync,
      rcloneConcurrency: values.defaultConcurrency.rclone,
      jobLong: values.defaultConcurrency.jobLong,
      jobShort: values.defaultConcurrency.jobShort,
      jobRemoteLimit: values.defaultConcurrency.jobRemoteLimit,
      warningThreshold: values.defaultCapacityWarningThresholdPercent,
      hashAlgorithm: values.hashAlgorithm,
      logLevel: values.logLevel,
      syncTransfers: values.syncProfile.transfers,
      syncCheckers: values.syncProfile.checkers,
      syncBufferSizeMiB: values.syncProfile.bufferSizeMiB,
      syncTpsLimit: values.syncProfile.tpsLimit,
      syncBwLimitMiB: values.syncProfile.bwLimitMiB,
      cloudTrashRetentionDays: values.cloudTrash.retentionDays,
      cloudTrashCleanupIntervalHours: values.cloudTrash.cleanupIntervalHours,
      cloudTrashMaxDeleteBatchPerRun: values.cloudTrash.maxDeleteBatchPerRun
    });
  }, [values]);

  const submit = () => {
    if (!form) return;
    mutation.mutate({
      rcloneRcd: { url: form.rcloneUrl, timeoutMs: form.timeoutMs, retryAttempts: form.retryAttempts, retryDelayMs: form.retryDelayMs },
      defaultScanIntervalSeconds: form.scanInterval,
      defaultConcurrency: {
        sync: form.syncConcurrency,
        rclone: form.rcloneConcurrency,
        jobLong: form.jobLong,
        jobShort: form.jobShort,
        jobRemoteLimit: form.jobRemoteLimit
      },
      defaultCapacityWarningThresholdPercent: form.warningThreshold,
      hashAlgorithm: form.hashAlgorithm as 'md5' | 'sha1' | 'sha256' | 'blake3',
      logLevel: form.logLevel as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace',
      syncProfile: {
        transfers: form.syncTransfers,
        checkers: form.syncCheckers,
        bufferSizeMiB: form.syncBufferSizeMiB,
        tpsLimit: form.syncTpsLimit,
        bwLimitMiB: form.syncBwLimitMiB
      },
      cloudTrash: {
        retentionDays: form.cloudTrashRetentionDays,
        cleanupIntervalHours: form.cloudTrashCleanupIntervalHours,
        maxDeleteBatchPerRun: form.cloudTrashMaxDeleteBatchPerRun
      }
    });
  };

  const num = (key: NumberKey, label: string, hint?: string) => (
    <label className="field" key={key}>
      <span>{label}</span>
      <input type="number" value={form?.[key] ?? ''} onChange={(event) => setForm((prev) => (prev ? { ...prev, [key]: Number(event.target.value) } : prev))} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );

  return (
    <div className="page page--with-savebar">
      <PageHeader title="设置" description="同步频率、速度、回收站和 rclone 连接参数。" />
      {query.isLoading ? <div className="skeleton skeleton--card" /> : null}
      {query.error ? <Callout tone="bad">加载设置失败：{errorText(query.error, '')}</Callout> : null}

      {form && values ? (
        <div className="panel settings-panel">
          <Section title="自动同步" description="后台按这个频率检查所有启用中的映射。">
            {num('scanInterval', '检查频率（秒）', `约每 ${Math.max(1, Math.round(form.scanInterval / 60))} 分钟一次`)}
            {num('warningThreshold', '云盘容量告警阈值（%）', '新建云盘时的默认值')}
          </Section>

          <Section title="同步速度" description="统一下发给所有同步任务。默认值偏保守：更慢，但对云盘接口更友好。">
            {num('syncTransfers', '同时传输文件数（transfers）')}
            {num('syncCheckers', '同时校验文件数（checkers）')}
            {num('syncBufferSizeMiB', '缓冲区（MiB）')}
            {num('syncTpsLimit', '每秒请求上限（TPS）')}
            {num('syncBwLimitMiB', '带宽上限（MiB/s）', '0 表示不限')}
          </Section>

          <Section title="云端回收站" description="镜像模式删除的文件会先进回收站。是否启用请在「云盘」中按云盘设置。">
            {num('cloudTrashRetentionDays', '保留天数')}
            {num('cloudTrashCleanupIntervalHours', '清理频率（小时）')}
            {num('cloudTrashMaxDeleteBatchPerRun', '单次最多清理文件数')}
          </Section>

          <Section title="并发" description="修改后可能需要重启后端才生效。">
            {num('syncConcurrency', '同步并发数')}
            {num('rcloneConcurrency', 'rclone 并发数')}
            {num('jobLong', '长任务 worker 数')}
            {num('jobShort', '短任务 worker 数')}
            {num('jobRemoteLimit', '单云盘同时任务上限')}
          </Section>

          <Section title="rclone 连接" description={`认证信息来自后端 .env：用户 ${values.rcloneRcd.user}，密码 ${values.rcloneRcd.passMasked}。`}>
            <label className="field field--wide">
              <span>rclone rcd 地址</span>
              <input
                className="mono"
                value={form.rcloneUrl}
                onChange={(event) => setForm((prev) => (prev ? { ...prev, rcloneUrl: event.target.value } : prev))}
              />
            </label>
            {num('timeoutMs', '超时（毫秒）')}
            {num('retryAttempts', '重试次数')}
            {num('retryDelayMs', '重试间隔（毫秒）')}
          </Section>

          <Section title="高级">
            <label className="field">
              <span>文件哈希算法</span>
              <select value={form.hashAlgorithm} onChange={(event) => setForm((prev) => (prev ? { ...prev, hashAlgorithm: event.target.value } : prev))}>
                {['md5', 'sha1', 'sha256', 'blake3'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>日志级别</span>
              <select value={form.logLevel} onChange={(event) => setForm((prev) => (prev ? { ...prev, logLevel: event.target.value } : prev))}>
                {['fatal', 'error', 'warn', 'info', 'debug', 'trace'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </Section>

          <Section title="数据源" description="开发调试用：前端请求使用模拟数据还是实时后端。">
            <Tabs
              value={mode}
              onChange={(next) => setApiMode(next)}
              items={[
                { value: 'live', label: '实时后端' },
                { value: 'mock', label: '模拟数据' }
              ]}
            />
          </Section>

          {(query.data?.item.hotUpdate.notes ?? []).length ? (
            <Callout tone="info">
              {query.data!.item.hotUpdate.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </Callout>
          ) : null}
        </div>
      ) : null}

      {form ? (
        <div className="savebar">
          <span className="muted">修改后点击保存生效。</span>
          <button onClick={() => void query.refetch()}>重新加载</button>
          <button className="button-primary" onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? '正在保存...' : '保存设置'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
