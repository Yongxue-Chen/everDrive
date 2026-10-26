import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { errorText, useFeedback } from '../components/feedback';
import { Callout, PageHeader } from '../components/ui';
import { fetchCloudRemotes, fetchMappingTasks, startCloudMigration } from '../lib/api';

export function CloudMigrationPage() {
  const { confirm, toast } = useFeedback();
  const tasks = useQuery({ queryKey: ['mapping-tasks'], queryFn: fetchMappingTasks });
  const remotes = useQuery({ queryKey: ['cloud-remotes'], queryFn: fetchCloudRemotes });
  const [taskId, setTaskId] = useState('');
  const [sourceRemoteId, setSource] = useState('');
  const [targetRemoteId, setTarget] = useState('');
  const [scopeRelativePath, setScope] = useState('');
  const [targetBasePath, setBase] = useState('');
  const [removeSourceReplica, setRemove] = useState(false);
  const migration = useMutation({
    mutationFn: () =>
      startCloudMigration(taskId, {
        sourceRemoteId,
        targetRemoteId,
        scopeRelativePath: scopeRelativePath || undefined,
        targetBasePath: targetBasePath || undefined,
        removeSourceReplica
      }),
    onSuccess: (response) => toast('success', '迁移任务已加入队列', `任务编号 ${response.job.id}`),
    onError: (error) => toast('error', '提交迁移任务失败', errorText(error, ''))
  });

  const task = tasks.data?.items.find((item) => item.id === taskId);
  const sourceOptions = task
    ? (remotes.data?.items ?? []).filter((remote) => task.remotes.some((bound) => bound.remoteId === remote.id))
    : (remotes.data?.items ?? []);
  const sourceName = remotes.data?.items.find((remote) => remote.id === sourceRemoteId)?.displayName;
  const targetName = remotes.data?.items.find((remote) => remote.id === targetRemoteId)?.displayName;
  const invalid = !taskId || !sourceRemoteId || !targetRemoteId || sourceRemoteId === targetRemoteId;

  const submit = async () => {
    if (invalid) return;
    if (removeSourceReplica) {
      const ok = await confirm({
        title: '迁移后删除源云盘副本？',
        description: `迁移完成后会删除「${sourceName}」上的副本，此操作无法撤销。`,
        confirmLabel: '确认迁移',
        danger: true
      });
      if (!ok) return;
    }
    migration.mutate();
  };

  return (
    <div className="page">
      <PageHeader eyebrow="工具" title="云端迁移" description="把某个映射已备份的文件，从一个云盘复制到另一个云盘。" />
      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span>映射</span>
            <select
              value={taskId}
              onChange={(event) => {
                setTaskId(event.target.value);
                setSource('');
              }}
            >
              <option value="">请选择映射</option>
              {tasks.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>迁移范围（相对路径）</span>
            <input className="mono" value={scopeRelativePath} onChange={(event) => setScope(event.target.value)} placeholder="留空表示整个映射" />
          </label>
        </div>
        <div className="migration-flow">
          <label className="field">
            <span>从云盘</span>
            <select value={sourceRemoteId} onChange={(event) => setSource(event.target.value)}>
              <option value="">请选择</option>
              {sourceOptions.map((remote) => (
                <option key={remote.id} value={remote.id}>
                  {remote.displayName}
                </option>
              ))}
            </select>
          </label>
          <ArrowRight className="migration-flow__arrow" size={20} />
          <label className="field">
            <span>到云盘</span>
            <select value={targetRemoteId} onChange={(event) => setTarget(event.target.value)}>
              <option value="">请选择</option>
              {remotes.data?.items.map((remote) => (
                <option key={remote.id} value={remote.id} disabled={remote.id === sourceRemoteId}>
                  {remote.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>目标子目录</span>
            <input className="mono" value={targetBasePath} onChange={(event) => setBase(event.target.value)} placeholder="留空沿用原路径" />
          </label>
        </div>
        <label className="toggle-card">
          <input type="checkbox" checked={removeSourceReplica} onChange={(event) => setRemove(event.target.checked)} />
          <span>
            <strong>迁移后删除源云盘副本</strong>
            <small>用于腾出源云盘空间。默认保留，两边都有一份。</small>
          </span>
        </label>
        {sourceName && targetName ? (
          <Callout tone={removeSourceReplica ? 'warn' : 'info'}>
            将把「{task?.name}」{scopeRelativePath ? `下的 ${scopeRelativePath}` : ''}从 <b>{sourceName}</b> {removeSourceReplica ? '移动' : '复制'}到{' '}
            <b>{targetName}</b>。
          </Callout>
        ) : null}
        <div className="inline-actions">
          <button className="button-primary" onClick={() => void submit()} disabled={invalid || migration.isPending}>
            {migration.isPending ? '正在提交...' : '提交迁移任务'}
          </button>
        </div>
      </section>
    </div>
  );
}
