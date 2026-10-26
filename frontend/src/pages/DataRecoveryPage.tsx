import { useMutation, useQuery } from '@tanstack/react-query';
import { FolderOpen, Search } from 'lucide-react';
import { useState } from 'react';
import { errorText, useFeedback } from '../components/feedback';
import { LocalPathPicker } from '../components/LocalPathPicker';
import { Callout, EmptyState } from '../components/ui';
import { listDataRecoveryFiles, listDataRecoveryTasks, runDataRecovery } from '../lib/api';
import { formatBytes } from '../lib/format';

export function DataRecoveryPage() {
  const { confirm, toast } = useFeedback();
  const [taskId, setTaskId] = useState('');
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [destination, setDestination] = useState('/data');
  const [overwrite, setOverwrite] = useState(false);
  const [picker, setPicker] = useState(false);
  const tasks = useQuery({ queryKey: ['data-recovery-tasks'], queryFn: listDataRecoveryTasks });
  const files = useQuery({
    queryKey: ['data-recovery-files', taskId, applied],
    queryFn: () => listDataRecoveryFiles(taskId, applied),
    enabled: Boolean(taskId)
  });
  const restore = useMutation({
    mutationFn: () => runDataRecovery(taskId, { destinationPath: destination, query: applied, conflictStrategy: overwrite ? 'overwrite' : 'skip' }),
    onSuccess: (response) =>
      toast(
        response.summary.failed ? 'error' : 'success',
        `恢复完成：${response.summary.restored} 个成功`,
        `跳过 ${response.summary.skipped} 个，失败 ${response.summary.failed} 个。`
      ),
    onError: (error) => toast('error', '恢复失败', errorText(error, ''))
  });

  const submit = async () => {
    if (overwrite) {
      const ok = await confirm({
        title: '使用覆盖模式恢复？',
        description: '覆盖模式会替换恢复目录中已存在的同名文件，此操作无法撤销。',
        confirmLabel: '覆盖并恢复',
        danger: true
      });
      if (!ok) return;
    }
    restore.mutate();
  };

  return (
    <>
      <Callout tone="info" title="安全恢复">
        默认跳过目标目录中的同名文件。每次最多恢复当前筛选结果中的 200 个文件；加密映射会使用服务器当前密钥自动解密。
      </Callout>
      <section className="panel">
        <div className="panel__head">
          <div>
            <h3>创建恢复计划</h3>
            <p className="muted">选择映射、文件范围和恢复位置。</p>
          </div>
        </div>
        <div className="form-grid">
          <label className="field">
            <span>映射</span>
            <select
              value={taskId}
              onChange={(event) => {
                setTaskId(event.target.value);
                setApplied('');
              }}
            >
              <option value="">请选择映射</option>
              {tasks.data?.items.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name} · {task.fileCount} 个文件{task.encryptionEnabled ? ' · 已加密' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>按原始路径筛选</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="留空恢复前 200 个，例如 Photos/2026" />
          </label>
          <label className="field">
            <span>恢复到服务器目录</span>
            <div className="path-input">
              <input className="mono" value={destination} readOnly onClick={() => setPicker(true)} />
              <button onClick={() => setPicker(true)}>
                <FolderOpen size={16} />
                选择目录
              </button>
            </div>
          </label>
          <label className="toggle-card">
            <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
            <span>
              <strong>覆盖同名文件</strong>
              <small>默认关闭；关闭时会安全跳过已有文件。</small>
            </span>
          </label>
        </div>
        <div className="inline-actions">
          <button onClick={() => setApplied(query.trim())} disabled={!taskId}>
            <Search size={15} />
            预览文件
          </button>
          <button className="button-primary" onClick={() => void submit()} disabled={!taskId || !destination || restore.isPending}>
            {restore.isPending ? '正在恢复...' : '开始恢复'}
          </button>
        </div>
      </section>

      {files.data ? (
        <section className="panel">
          <div className="panel__head">
            <div>
              <h3>可恢复文件</h3>
              <p className="muted">当前显示 {files.data.items.length} 个文件。</p>
            </div>
          </div>
          {files.data.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>原始路径</th>
                    <th>大小</th>
                    <th>云端来源</th>
                  </tr>
                </thead>
                <tbody>
                  {files.data.items.map((file) => (
                    <tr key={file.id}>
                      <td className="mono">{file.relativePath}</td>
                      <td>{formatBytes(file.fileSize)}</td>
                      <td>{file.source?.displayName ?? <span className="text-bad">无可用副本</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="没有匹配的文件" description="换个筛选条件试试。" />
          )}
        </section>
      ) : null}

      {restore.data ? (
        <section className="kpi-grid kpi-grid--3">
          <div className="kpi kpi--good">
            <span className="kpi__label">已恢复</span>
            <b className="kpi__value">{restore.data.summary.restored}</b>
          </div>
          <div className="kpi">
            <span className="kpi__label">已跳过</span>
            <b className="kpi__value">{restore.data.summary.skipped}</b>
          </div>
          <div className={`kpi ${restore.data.summary.failed ? 'kpi--bad' : ''}`}>
            <span className="kpi__label">失败</span>
            <b className="kpi__value">{restore.data.summary.failed}</b>
          </div>
        </section>
      ) : null}
      {restore.data?.summary.failures.length ? (
        <section className="panel">
          <h3>失败明细</h3>
          <ul className="plain-list">
            {restore.data.summary.failures.map((failure) => (
              <li key={failure.relativePath}>
                <span className="mono">{failure.relativePath}</span> — <span className="text-bad">{failure.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <LocalPathPicker isOpen={picker} selectedPath={destination} onClose={() => setPicker(false)} onSelect={(path) => setDestination(path)} />
    </>
  );
}
