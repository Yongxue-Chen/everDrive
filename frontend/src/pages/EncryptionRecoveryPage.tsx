import { useQuery } from '@tanstack/react-query';
import { Download, Search } from 'lucide-react';
import { useState } from 'react';
import { errorText } from '../components/feedback';
import { Callout, EmptyState } from '../components/ui';
import { encryptionRecoveryDownloadUrl, listEncryptionRecoveryFiles, listEncryptionRecoveryTasks } from '../lib/api';
import { formatBytes, formatDate } from '../lib/format';

/** 加密恢复: decrypt and download single files from encrypted cloud replicas. */
export function EncryptionRecoveryPage() {
  const [taskId, setTaskId] = useState('');
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const tasks = useQuery({ queryKey: ['encryption-recovery-tasks'], queryFn: listEncryptionRecoveryTasks });
  const files = useQuery({
    queryKey: ['encryption-recovery-files', taskId, appliedQuery],
    queryFn: () => listEncryptionRecoveryFiles(taskId, appliedQuery),
    enabled: Boolean(taskId)
  });

  return (
    <>
      <Callout tone="warn" title="恢复前确认">
        恢复依赖当前容器的 <span className="mono">ENCRYPTION_MASTER_KEY</span>。密钥错误、文件损坏或副本不可访问时，AES-GCM 校验会阻止输出无效文件。
      </Callout>
      <section className="panel">
        <div className="form-grid">
          <label className="field">
            <span>加密映射</span>
            <select
              value={taskId}
              onChange={(event) => {
                setTaskId(event.target.value);
                setAppliedQuery('');
                setQuery('');
              }}
            >
              <option value="">请选择映射</option>
              {tasks.data?.items.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}（{task.fileCount} 个文件）
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>按原始路径搜索</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="例如 photos/2026"
              onKeyDown={(event) => event.key === 'Enter' && setAppliedQuery(query.trim())}
            />
          </label>
        </div>
        <div className="inline-actions">
          <button disabled={!taskId || files.isFetching} onClick={() => setAppliedQuery(query.trim())}>
            <Search size={15} />
            {files.isFetching ? '查询中...' : '查询文件'}
          </button>
        </div>
      </section>

      {files.error ? <Callout tone="bad">{errorText(files.error, '读取可恢复文件失败。')}</Callout> : null}
      {taskId && !files.isFetching && files.data && files.data.items.length === 0 ? (
        <section className="panel">
          <EmptyState title="没有找到可恢复的成功副本" />
        </section>
      ) : null}
      {(files.data?.items.length ?? 0) > 0 ? (
        <section className="panel">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>原始路径</th>
                  <th>大小</th>
                  <th>修改时间</th>
                  <th>从副本解密下载</th>
                </tr>
              </thead>
              <tbody>
                {files.data?.items.map((file) => (
                  <tr key={file.id}>
                    <td className="mono">{file.relativePath}</td>
                    <td>{formatBytes(file.fileSize)}</td>
                    <td>{formatDate(file.modifiedTime)}</td>
                    <td>
                      <div className="inline-actions">
                        {file.replicas.map((replica) => (
                          <a className="button-link button-sm" key={replica.remoteId} href={encryptionRecoveryDownloadUrl(file.id, replica.remoteId)}>
                            <Download size={14} />从 {replica.displayName} 解密下载
                          </a>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">最多显示 200 个文件，可使用路径搜索缩小范围。</p>
        </section>
      ) : null}
    </>
  );
}
