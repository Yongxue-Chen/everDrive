import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { encryptionRecoveryDownloadUrl, listEncryptionRecoveryFiles, listEncryptionRecoveryTasks } from '../lib/api';

function formatBytes(raw: string): string {
  const bytes = Number(raw);
  if (!Number.isFinite(bytes)) return raw;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

export function EncryptionRecoveryPage() {
  const [taskId, setTaskId] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const tasks = useQuery({ queryKey: ['encryption-recovery-tasks'], queryFn: listEncryptionRecoveryTasks });
  const files = useQuery({ queryKey: ['encryption-recovery-files', taskId, appliedQuery], queryFn: () => listEncryptionRecoveryFiles(taskId, appliedQuery), enabled: Boolean(taskId) });

  return <div className="page">
    <header className="page__header"><div><h1>加密恢复</h1><p className="muted">使用服务器现有主密钥，从已同步副本解密并下载原始文件。</p></div></header>
    <section className="panel panel--warning"><strong>恢复前确认</strong><p className="muted">恢复依赖当前容器的 ENCRYPTION_MASTER_KEY。密钥错误、文件损坏或副本不可访问时，AES-GCM 校验会阻止输出无效文件。</p></section>
    <section className="panel"><div className="settings-grid"><label>加密映射任务<select value={taskId} onChange={(event) => { setTaskId(event.target.value); setAppliedQuery(''); setQuery(''); }}><option value="">请选择任务</option>{tasks.data?.items.map((task) => <option key={task.id} value={task.id}>{task.name}（{task.fileCount} 个文件）</option>)}</select></label><label>按原始路径搜索<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如 photos/2026" /></label></div><button disabled={!taskId || files.isFetching} onClick={() => setAppliedQuery(query.trim())}>{files.isFetching ? '查询中...' : '查询文件'}</button></section>
    {files.error ? <section className="panel"><p className="error">{files.error instanceof Error ? files.error.message : '读取可恢复文件失败。'}</p></section> : null}
    {taskId && !files.isFetching && (files.data?.items.length ?? 0) === 0 ? <section className="panel panel--neutral"><p>没有找到可恢复的成功副本。</p></section> : null}
    {(files.data?.items.length ?? 0) > 0 ? <section className="panel"><div className="table-wrap"><table className="table"><thead><tr><th>原始路径</th><th>大小</th><th>修改时间</th><th>可用副本与操作</th></tr></thead><tbody>{files.data?.items.map((file) => <tr key={file.id}><td className="mono">{file.relativePath}</td><td>{formatBytes(file.fileSize)}</td><td>{new Date(file.modifiedTime).toLocaleString()}</td><td><div className="table__actions">{file.replicas.map((replica) => <a className="button-link" key={replica.remoteId} href={encryptionRecoveryDownloadUrl(file.id, replica.remoteId)}>从 {replica.displayName} 解密下载</a>)}</div></td></tr>)}</tbody></table></div><p className="muted">当前最多显示 200 个文件，可使用路径搜索缩小范围。</p></section> : null}
  </div>;
}
