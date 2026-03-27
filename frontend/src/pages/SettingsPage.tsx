import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { fetchSettings, getApiMode, setApiMode, updateSettings } from '../lib/api';
import type { ApiMode } from '../lib/types';

export function SettingsPage() {
  const [mode, setMode] = useState<ApiMode>(getApiMode());
  const query = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const mutation = useMutation({ mutationFn: updateSettings });

  const values = query.data?.item.values;
  const [form, setForm] = useState({
    rcloneUrl: '',
    timeoutMs: 5000,
    retryAttempts: 2,
    retryDelayMs: 250,
    scanInterval: 30,
    syncConcurrency: 4,
    rcloneConcurrency: 4,
    jobLong: 2,
    jobShort: 1,
    jobRemoteLimit: 1,
    warningThreshold: 85,
    hashAlgorithm: 'sha1',
    logLevel: 'info'
  });

  useEffect(() => {
    const onModeChanged = (event: Event) => {
      const custom = event as CustomEvent<ApiMode>;
      setMode(custom.detail);
    };
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
      logLevel: values.logLevel
    });
  }, [values]);

  const hotUpdateSummary = useMemo(() => query.data?.item.hotUpdate, [query.data?.item.hotUpdate]);

  const submit = () => {
    mutation.mutate({
      rcloneRcd: {
        url: form.rcloneUrl,
        timeoutMs: Number(form.timeoutMs),
        retryAttempts: Number(form.retryAttempts),
        retryDelayMs: Number(form.retryDelayMs)
      },
      defaultScanIntervalSeconds: Number(form.scanInterval),
      defaultConcurrency: {
        sync: Number(form.syncConcurrency),
        rclone: Number(form.rcloneConcurrency),
        jobLong: Number(form.jobLong),
        jobShort: Number(form.jobShort),
        jobRemoteLimit: Number(form.jobRemoteLimit)
      },
      defaultCapacityWarningThresholdPercent: Number(form.warningThreshold),
      hashAlgorithm: form.hashAlgorithm as 'md5' | 'sha1' | 'sha256' | 'blake3',
      logLevel: form.logLevel as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace'
    });
  };

  return (
    <div className="page">
      <header className="page__header">
        <h1>系统设置</h1>
      </header>
      <section className="panel">
        <h3>数据源</h3>
        <p>切换前端请求使用模拟数据还是实时后端接口。</p>
        <div className="toggle-row">
          <button className={mode === 'mock' ? 'active' : ''} onClick={() => setApiMode('mock')}>
            模拟数据
          </button>
          <button className={mode === 'live' ? 'active' : ''} onClick={() => setApiMode('live')}>
            实时后端
          </button>
        </div>
        <p className="muted">当前模式：{mode === 'mock' ? '模拟数据' : '实时后端'}</p>
      </section>

      <section className="panel">
        <h3>配置管理</h3>
        {query.isLoading ? <p>正在加载设置...</p> : null}
        {query.error ? <p className="error">加载设置失败。</p> : null}
        {values ? (
          <div className="settings-grid">
            <label>
              Rclone 地址
              <input value={form.rcloneUrl} onChange={(e) => setForm((prev) => ({ ...prev, rcloneUrl: e.target.value }))} />
            </label>
            <div className="panel panel--neutral settings-note">
              <strong>rclone rcd 认证</strong>
              <p className="muted">用户名和密码当前直接来自后端 `.env`，UI 不再要求手动输入。</p>
              <p className="muted">当前用户名：{values.rcloneRcd.user}</p>
              <p className="muted">当前密码：{values.rcloneRcd.passMasked}</p>
            </div>
            <label>
              扫描间隔（秒）
              <input type="number" value={form.scanInterval} onChange={(e) => setForm((prev) => ({ ...prev, scanInterval: Number(e.target.value) }))} />
            </label>
            <label>
              同步并发数
              <input type="number" value={form.syncConcurrency} onChange={(e) => setForm((prev) => ({ ...prev, syncConcurrency: Number(e.target.value) }))} />
            </label>
            <label>
              Rclone 并发数
              <input type="number" value={form.rcloneConcurrency} onChange={(e) => setForm((prev) => ({ ...prev, rcloneConcurrency: Number(e.target.value) }))} />
            </label>
            <label>
              长任务 Worker 数
              <input type="number" value={form.jobLong} onChange={(e) => setForm((prev) => ({ ...prev, jobLong: Number(e.target.value) }))} />
            </label>
            <label>
              短任务 Worker 数
              <input type="number" value={form.jobShort} onChange={(e) => setForm((prev) => ({ ...prev, jobShort: Number(e.target.value) }))} />
            </label>
            <label>
              单任务云盘上限
              <input type="number" value={form.jobRemoteLimit} onChange={(e) => setForm((prev) => ({ ...prev, jobRemoteLimit: Number(e.target.value) }))} />
            </label>
            <label>
              告警阈值（%）
              <input type="number" value={form.warningThreshold} onChange={(e) => setForm((prev) => ({ ...prev, warningThreshold: Number(e.target.value) }))} />
            </label>
            <label>
              哈希算法
              <select value={form.hashAlgorithm} onChange={(e) => setForm((prev) => ({ ...prev, hashAlgorithm: e.target.value }))}>
                <option value="md5">md5</option>
                <option value="sha1">sha1</option>
                <option value="sha256">sha256</option>
                <option value="blake3">blake3</option>
              </select>
            </label>
            <label>
              日志级别
              <select value={form.logLevel} onChange={(e) => setForm((prev) => ({ ...prev, logLevel: e.target.value }))}>
                <option value="fatal">fatal</option>
                <option value="error">error</option>
                <option value="warn">warn</option>
                <option value="info">info</option>
                <option value="debug">debug</option>
                <option value="trace">trace</option>
              </select>
            </label>
            <label>
              Rclone 超时（毫秒）
              <input type="number" value={form.timeoutMs} onChange={(e) => setForm((prev) => ({ ...prev, timeoutMs: Number(e.target.value) }))} />
            </label>
            <label>
              Rclone 重试次数
              <input type="number" value={form.retryAttempts} onChange={(e) => setForm((prev) => ({ ...prev, retryAttempts: Number(e.target.value) }))} />
            </label>
            <label>
              Rclone 重试延迟（毫秒）
              <input type="number" value={form.retryDelayMs} onChange={(e) => setForm((prev) => ({ ...prev, retryDelayMs: Number(e.target.value) }))} />
            </label>
          </div>
        ) : null}
        <div className="toggle-row">
          <button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? '正在保存...' : '保存设置'}
          </button>
          <button onClick={() => query.refetch()}>重新加载</button>
        </div>
        {mutation.error ? <p className="error">更新设置失败。</p> : null}
        {mutation.data ? (
          <div className="panel panel--neutral">
            <p className="muted">热更新项：{mutation.data.item.hotUpdate.hotUpdatedKeys.join(', ') || '-'}</p>
            <p className="muted">需要重启：{mutation.data.item.hotUpdate.restartRequiredKeys.join(', ') || '-'}</p>
            {mutation.data.item.hotUpdate.notes.map((note) => (
              <p className="muted" key={note}>
                {note}
              </p>
            ))}
          </div>
        ) : hotUpdateSummary ? (
          <div>
            {hotUpdateSummary.notes.map((note) => (
              <p className="muted" key={note}>
                {note}
              </p>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
