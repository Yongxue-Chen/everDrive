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
    rcloneUser: '',
    rclonePass: '',
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
      rcloneUser: values.rcloneRcd.user,
      rclonePass: '',
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
        user: form.rcloneUser,
        pass: form.rclonePass || undefined,
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
        <h1>Settings</h1>
      </header>
      <section className="panel">
        <h3>Data Source</h3>
        <p>Switch frontend requests between mock data and backend API.</p>
        <div className="toggle-row">
          <button className={mode === 'mock' ? 'active' : ''} onClick={() => setApiMode('mock')}>
            Mock
          </button>
          <button className={mode === 'live' ? 'active' : ''} onClick={() => setApiMode('live')}>
            Live API
          </button>
        </div>
        <p className="muted">Current mode: {mode}</p>
      </section>

      <section className="panel">
        <h3>Configuration Management</h3>
        {query.isLoading ? <p>Loading settings...</p> : null}
        {query.error ? <p className="error">Failed to load settings.</p> : null}
        {values ? (
          <div className="settings-grid">
            <label>
              Rclone URL
              <input value={form.rcloneUrl} onChange={(e) => setForm((prev) => ({ ...prev, rcloneUrl: e.target.value }))} />
            </label>
            <label>
              Rclone User
              <input value={form.rcloneUser} onChange={(e) => setForm((prev) => ({ ...prev, rcloneUser: e.target.value }))} />
            </label>
            <label>
              Rclone Password (留空保持不变)
              <input type="password" value={form.rclonePass} onChange={(e) => setForm((prev) => ({ ...prev, rclonePass: e.target.value }))} />
              <small className="muted">Current: {values.rcloneRcd.passMasked}</small>
            </label>
            <label>
              Scan Interval (s)
              <input type="number" value={form.scanInterval} onChange={(e) => setForm((prev) => ({ ...prev, scanInterval: Number(e.target.value) }))} />
            </label>
            <label>
              Sync Concurrency
              <input type="number" value={form.syncConcurrency} onChange={(e) => setForm((prev) => ({ ...prev, syncConcurrency: Number(e.target.value) }))} />
            </label>
            <label>
              Rclone Concurrency
              <input type="number" value={form.rcloneConcurrency} onChange={(e) => setForm((prev) => ({ ...prev, rcloneConcurrency: Number(e.target.value) }))} />
            </label>
            <label>
              Job Worker Long
              <input type="number" value={form.jobLong} onChange={(e) => setForm((prev) => ({ ...prev, jobLong: Number(e.target.value) }))} />
            </label>
            <label>
              Job Worker Short
              <input type="number" value={form.jobShort} onChange={(e) => setForm((prev) => ({ ...prev, jobShort: Number(e.target.value) }))} />
            </label>
            <label>
              Job Remote Limit
              <input type="number" value={form.jobRemoteLimit} onChange={(e) => setForm((prev) => ({ ...prev, jobRemoteLimit: Number(e.target.value) }))} />
            </label>
            <label>
              Warning Threshold (%)
              <input type="number" value={form.warningThreshold} onChange={(e) => setForm((prev) => ({ ...prev, warningThreshold: Number(e.target.value) }))} />
            </label>
            <label>
              Hash Algorithm
              <select value={form.hashAlgorithm} onChange={(e) => setForm((prev) => ({ ...prev, hashAlgorithm: e.target.value }))}>
                <option value="md5">md5</option>
                <option value="sha1">sha1</option>
                <option value="sha256">sha256</option>
                <option value="blake3">blake3</option>
              </select>
            </label>
            <label>
              Log Level
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
              Rclone Timeout (ms)
              <input type="number" value={form.timeoutMs} onChange={(e) => setForm((prev) => ({ ...prev, timeoutMs: Number(e.target.value) }))} />
            </label>
            <label>
              Rclone Retry Attempts
              <input type="number" value={form.retryAttempts} onChange={(e) => setForm((prev) => ({ ...prev, retryAttempts: Number(e.target.value) }))} />
            </label>
            <label>
              Rclone Retry Delay (ms)
              <input type="number" value={form.retryDelayMs} onChange={(e) => setForm((prev) => ({ ...prev, retryDelayMs: Number(e.target.value) }))} />
            </label>
          </div>
        ) : null}
        <div className="toggle-row">
          <button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Saving...' : 'Save Settings'}
          </button>
          <button onClick={() => query.refetch()}>Reload</button>
        </div>
        {mutation.error ? <p className="error">Failed to update settings.</p> : null}
        {mutation.data ? (
          <div className="panel panel--neutral">
            <p className="muted">Hot Updated: {mutation.data.item.hotUpdate.hotUpdatedKeys.join(', ') || '-'}</p>
            <p className="muted">Restart Required: {mutation.data.item.hotUpdate.restartRequiredKeys.join(', ') || '-'}</p>
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
