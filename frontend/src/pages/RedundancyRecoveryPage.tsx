import { useMutation, useQuery } from '@tanstack/react-query';
import { Wrench } from 'lucide-react';
import { useState } from 'react';
import { errorText, useFeedback } from '../components/feedback';
import { Callout, EmptyState } from '../components/ui';
import { fetchMappingTasks, fetchRedundancyOverview, retryFailedReplicas } from '../lib/api';

const levelLabels = { ok: '副本完整', degraded: '部分副本缺失', critical: '需要立即处理' } as const;
const levelTones = { ok: 'good', degraded: 'warn', critical: 'bad' } as const;

export function RedundancyRecoveryPage() {
  const { toast } = useFeedback();
  const [taskId, setTaskId] = useState('');
  const tasks = useQuery({ queryKey: ['mapping-tasks'], queryFn: fetchMappingTasks });
  const overview = useQuery({ queryKey: ['redundancy', taskId], queryFn: () => fetchRedundancyOverview(taskId), enabled: Boolean(taskId) });
  const retry = useMutation({
    mutationFn: () => retryFailedReplicas(taskId),
    onSuccess: (response) => {
      toast('success', `已处理 ${response.summary.retriedFiles} 个文件`);
      void overview.refetch();
    },
    onError: (error) => toast('error', '修复失败', errorText(error, ''))
  });
  const item = overview.data?.item;
  const redundantTasks = tasks.data?.items.filter((task) => task.redundancy_enabled) ?? [];

  return (
    <>
      <Callout tone="info" title="副本修复不会恢复本地文件">
        它用于补齐多个云盘之间的备份副本。如果本地原文件已经丢失，请使用「数据恢复」或「加密恢复」。
      </Callout>
      <section className="panel">
        <label className="field field--narrow">
          <span>多云冗余映射</span>
          <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
            <option value="">请选择映射</option>
            {redundantTasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.name}
              </option>
            ))}
          </select>
        </label>
        {tasks.data && redundantTasks.length === 0 ? <p className="muted">当前没有启用「多云冗余」的映射。</p> : null}
      </section>

      {item ? (
        <>
          <section className="kpi-grid kpi-grid--3">
            <div className={`kpi kpi--${levelTones[item.protectionLevel]}`}>
              <span className="kpi__label">保护状态</span>
              <b className="kpi__value">{levelLabels[item.protectionLevel]}</b>
            </div>
            <div className="kpi">
              <span className="kpi__label">文件数</span>
              <b className="kpi__value">{item.fileCount.toLocaleString()}</b>
            </div>
            <div className="kpi">
              <span className="kpi__label">最低可用副本</span>
              <b className="kpi__value">
                {item.replicaAchieved}/{item.replicaTarget}
              </b>
            </div>
          </section>
          <section className="panel">
            <div className="panel__head">
              <div>
                <h3>各云盘副本状态</h3>
                <p className="muted">失败和待处理的副本可以从原始来源重新上传。</p>
              </div>
              <button className="button-primary" onClick={() => retry.mutate()} disabled={retry.isPending}>
                <Wrench size={15} />
                {retry.isPending ? '正在修复...' : '修复失败副本'}
              </button>
            </div>
            {item.remotes.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>云盘</th>
                      <th>成功</th>
                      <th>待处理</th>
                      <th>失败</th>
                      <th>已删除</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.remotes.map((remote) => (
                      <tr key={remote.remoteId}>
                        <td>{remote.displayName}</td>
                        <td className="text-good">{remote.syncedCount}</td>
                        <td>{remote.pendingCount}</td>
                        <td className={remote.failedCount ? 'text-bad' : ''}>{remote.failedCount}</td>
                        <td>{remote.deletedCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="没有云盘数据" />
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
