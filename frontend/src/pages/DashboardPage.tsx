import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Clock, Database, FolderSync, Plus, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MappingFlow } from '../components/MappingFlow';
import { Badge, EmptyState, ProgressBar } from '../components/ui';
import { fetchCloudRemotes, fetchSettings, fetchWorkspaceView, getApiMode, listRcloneSources } from '../lib/api';
import { formatBytes, formatDate, formatPercent, formatRelative } from '../lib/format';
import { flowFromWorkspace } from '../lib/mapping-view';
import type { WorkspaceItem } from '../lib/types';

type Tone = 'good' | 'warn' | 'bad' | 'neutral';

const currentState = (item: WorkspaceItem): [string, Tone] => {
  if (item.is_active === false) return ['已停用', 'neutral'];
  if (item.attention_reasons.length) return ['需要处理', 'bad'];
  if (item.latest_sync_status === 'running') return ['正在同步', 'warn'];
  if (item.latest_sync_status === 'queued') return ['同步排队中', 'warn'];
  if (item.pending_change_count > 0) return [`${item.pending_change_count} 个变化待同步`, 'neutral'];
  if (item.latest_sync_status === 'success') return ['已是最新', 'good'];
  return ['等待首次同步', 'neutral'];
};

const lastResult = (status: string | null): [string, Tone] => {
  if (status === 'success') return ['同步成功', 'good'];
  if (status === 'failed') return ['同步失败', 'bad'];
  if (status === 'running') return ['正在同步', 'warn'];
  if (status === 'queued') return ['已排队', 'warn'];
  return ['尚未同步', 'neutral'];
};

function nextSyncAt(items: WorkspaceItem[], intervalSeconds: number) {
  const latest = Math.max(...items.map((item) => (item.latest_sync_finished_at ? new Date(item.latest_sync_finished_at).getTime() : 0)), 0);
  const interval = Math.max(1, intervalSeconds) * 1000;
  let next = latest ? latest + interval : Date.now() + interval;
  while (next <= Date.now()) next += interval;
  return new Date(next).toISOString();
}

const reasonLink = (reason: string): [string, string] =>
  ['云盘', '无法连接', '空间已满', '已停用', '容量或连接'].some((keyword) => reason.includes(keyword))
    ? ['/cloud-remotes', '查看云盘']
    : ['/operation-logs', '查看活动记录'];

export function DashboardPage() {
  const workspace = useQuery({ queryKey: ['workspace-view'], queryFn: fetchWorkspaceView, refetchInterval: 10000 });
  const remotes = useQuery({ queryKey: ['cloud-remotes'], queryFn: fetchCloudRemotes, refetchInterval: 30000 });
  const settings = useQuery({ queryKey: ['settings'], queryFn: fetchSettings });
  const sources = useQuery({ queryKey: ['rclone-sources'], queryFn: listRcloneSources, enabled: getApiMode() === 'live' });

  const items = workspace.data?.items ?? [];
  const issues = items.filter((item) => item.attention_reasons.length > 0);
  const healthy = items.length > 0 && issues.length === 0;
  const totalBytes = items.reduce((sum, item) => sum + Number(item.total_size), 0);
  const totalFiles = items.reduce((sum, item) => sum + item.file_count, 0);
  const activeCount = items.filter((item) => item.is_active !== false).length;
  const interval = settings.data?.item.values.defaultScanIntervalSeconds ?? 900;
  const next = nextSyncAt(items, interval);
  const recent = [...items].filter((item) => item.latest_sync_finished_at).sort((a, b) => b.latest_sync_finished_at!.localeCompare(a.latest_sync_finished_at!));

  const heroTitle = workspace.isLoading
    ? '正在检查…'
    : items.length === 0
      ? '开始保护你的文件'
      : healthy
        ? '文件保护运行正常'
        : `${issues.length} 个映射需要关注`;
  const heroText =
    items.length === 0
      ? '创建第一个映射，选择要备份的目录和目标云盘。'
      : healthy
        ? '所有映射都在按计划同步，没有需要人工处理的问题。'
        : '下面列出了需要人工处理的问题；正常等待同步不会出现在这里。';

  return (
    <div className="page">
      <section className={`hero hero--${items.length === 0 ? 'neutral' : healthy ? 'good' : 'bad'}`}>
        <div className="hero__icon">{healthy || items.length === 0 ? <ShieldCheck size={28} /> : <AlertTriangle size={28} />}</div>
        <div className="hero__text">
          <span className="eyebrow">概览</span>
          <h1>{heroTitle}</h1>
          <p>{heroText}</p>
        </div>
        <Link className="button-link button-primary" to="/mapping-tasks">
          <Plus size={16} />
          新建映射
        </Link>
      </section>

      <section className="kpi-grid">
        <div className="kpi">
          <span className="kpi__icon">
            <Database size={18} />
          </span>
          <span className="kpi__label">受保护数据</span>
          <b className="kpi__value">{formatBytes(totalBytes)}</b>
          <small>{totalFiles.toLocaleString()} 个文件</small>
        </div>
        <div className="kpi">
          <span className="kpi__icon">
            <FolderSync size={18} />
          </span>
          <span className="kpi__label">映射</span>
          <b className="kpi__value">{items.length}</b>
          <small>{activeCount} 个启用中</small>
        </div>
        <div className={`kpi ${issues.length ? 'kpi--bad' : ''}`}>
          <span className="kpi__icon">
            <AlertTriangle size={18} />
          </span>
          <span className="kpi__label">需要关注</span>
          <b className="kpi__value">{issues.length}</b>
          <small>仅统计需人工处理的问题</small>
        </div>
        <div className="kpi">
          <span className="kpi__icon">
            <Clock size={18} />
          </span>
          <span className="kpi__label">下次自动同步</span>
          <b className="kpi__value" title={formatDate(next)}>
            {formatRelative(next)}
          </b>
          <small>每 {Math.round(interval / 60)} 分钟检查一次</small>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel">
          <div className="panel__head">
            <div>
              <h3>我的映射</h3>
              <p className="muted">每个映射备份到哪里，一眼可见。</p>
            </div>
            <Link to="/mapping-tasks" className="text-link">
              管理映射 <ArrowRight size={14} />
            </Link>
          </div>
          {items.length === 0 && !workspace.isLoading ? (
            <EmptyState icon={<FolderSync size={26} />} title="还没有映射" description="创建映射后，这里会显示每个目录的备份去向和状态。" />
          ) : null}
          <div className="mapping-rows">
            {items.map((item) => {
              const [state, tone] = currentState(item);
              return (
                <Link to="/mapping-tasks" className="mapping-row" key={item.mapping_task_id}>
                  <div className="mapping-row__head">
                    <strong>{item.name}</strong>
                    <Badge tone={tone}>{state}</Badge>
                  </div>
                  <MappingFlow flow={flowFromWorkspace(item, sources.data?.items)} compact />
                  <div className="mapping-row__meta">
                    <span title={formatDate(item.last_sync_at)}>上次成功 {formatRelative(item.last_sync_at)}</span>
                    <span>
                      {item.file_count.toLocaleString()} 个文件 · {formatBytes(item.total_size)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>

        <aside className="dashboard-aside">
          <section className="panel">
            <div className="panel__head">
              <h3>需要关注</h3>
            </div>
            {issues.length ? (
              <div className="attention-list">
                {issues.flatMap((item) =>
                  item.attention_reasons.map((reason) => {
                    const [to, label] = reasonLink(reason);
                    return (
                      <div className="attention-item" key={`${item.mapping_task_id}-${reason}`}>
                        <AlertTriangle size={16} />
                        <div>
                          <strong>{item.name}</strong>
                          <p>{reason}</p>
                        </div>
                        <Link to={to} className="text-link">
                          {label}
                        </Link>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="all-clear">
                <ShieldCheck size={18} />
                没有待处理问题
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel__head">
              <h3>云盘容量</h3>
              <Link to="/cloud-remotes" className="text-link">
                全部 <ArrowRight size={14} />
              </Link>
            </div>
            <div className="capacity-list">
              {(remotes.data?.items ?? []).map((remote) => (
                <div className="capacity-item" key={remote.id}>
                  <div className="capacity-item__head">
                    <span>{remote.displayName}</span>
                    <span className="muted">
                      {remote.capacity.realUsageAvailable || Number(remote.capacity.totalCapacityBytes) > 0
                        ? formatPercent(remote.capacity.usagePercent)
                        : '未知'}
                    </span>
                  </div>
                  <ProgressBar percent={remote.capacity.usagePercent} threshold={remote.capacity.warningThresholdPercent} />
                  <small className="muted">剩余 {formatBytes(remote.capacity.remainingCapacityBytes)}</small>
                </div>
              ))}
              {remotes.data?.items.length === 0 ? <p className="muted">还没有添加云盘。</p> : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel__head">
              <h3>最近同步</h3>
              <Link to="/operation-logs" className="text-link">
                活动记录 <ArrowRight size={14} />
              </Link>
            </div>
            {recent.length ? (
              recent.slice(0, 5).map((item) => {
                const [label, tone] = lastResult(item.latest_sync_status);
                return (
                  <div className="activity-item" key={item.mapping_task_id}>
                    <span className={`activity-dot activity-dot--${tone}`} />
                    <div>
                      <strong>{item.name}</strong>
                      <p>
                        {label} · <span title={formatDate(item.latest_sync_finished_at)}>{formatRelative(item.latest_sync_finished_at)}</span>
                      </p>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="muted">暂无同步记录。</p>
            )}
          </section>
        </aside>
      </section>
    </div>
  );
}
