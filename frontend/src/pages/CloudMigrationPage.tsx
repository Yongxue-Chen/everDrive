import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { fetchCloudRemotes, fetchMappingTasks, startCloudMigration } from '../lib/api';

export function CloudMigrationPage() {
  const tasks = useQuery({ queryKey: ['mapping-tasks'], queryFn: fetchMappingTasks });
  const remotes = useQuery({ queryKey: ['cloud-remotes'], queryFn: fetchCloudRemotes });
  const [taskId, setTaskId] = useState(''); const [sourceRemoteId, setSource] = useState(''); const [targetRemoteId, setTarget] = useState('');
  const [scopeRelativePath, setScope] = useState(''); const [targetBasePath, setBase] = useState(''); const [removeSourceReplica, setRemove] = useState(false);
  const migration = useMutation({ mutationFn: () => startCloudMigration(taskId, { sourceRemoteId, targetRemoteId, scopeRelativePath: scopeRelativePath || undefined, targetBasePath: targetBasePath || undefined, removeSourceReplica }) });
  const submit = () => { if (!taskId || !sourceRemoteId || !targetRemoteId || sourceRemoteId === targetRemoteId) return; if (removeSourceReplica && !window.confirm('迁移完成后将删除源云盘副本，确认继续吗？')) return; migration.mutate(); };
  return <div className="page"><header className="page__header"><div><h1>云端迁移</h1><p className="muted">在业务云盘之间复制文件，可选择迁移后删除源云端副本。</p></div></header><section className="panel settings-grid">
    <label>映射任务<select value={taskId} onChange={e=>setTaskId(e.target.value)}><option value="">请选择</option>{tasks.data?.items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
    <label>来源云盘<select value={sourceRemoteId} onChange={e=>setSource(e.target.value)}><option value="">请选择</option>{remotes.data?.items.map(x=><option key={x.id} value={x.id}>{x.displayName}</option>)}</select></label>
    <label>目标云盘<select value={targetRemoteId} onChange={e=>setTarget(e.target.value)}><option value="">请选择</option>{remotes.data?.items.map(x=><option key={x.id} value={x.id}>{x.displayName}</option>)}</select></label>
    <label>迁移范围<input value={scopeRelativePath} onChange={e=>setScope(e.target.value)} placeholder="留空表示整个映射" /></label><label>目标基础路径<input value={targetBasePath} onChange={e=>setBase(e.target.value)} /></label>
    <label className="checkbox-row"><input type="checkbox" checked={removeSourceReplica} onChange={e=>setRemove(e.target.checked)} />迁移后删除源云端副本</label><button onClick={submit} disabled={migration.isPending}>提交迁移任务</button>
    {migration.data?<p>任务已加入队列：{migration.data.job.id}</p>:null}{migration.error?<p className="error">{String(migration.error)}</p>:null}
  </section></div>;
}
