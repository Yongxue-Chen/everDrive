import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderSync, LayoutList, Network, Pause, Pencil, Play, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { errorText, useFeedback } from '../components/feedback';
import { MappingFlow } from '../components/MappingFlow';
import { MappingWizard } from '../components/MappingWizard';
import { SyncProgress } from '../components/SyncProgress';
import { TopologyView } from '../components/TopologyView';
import { Badge, Callout, EmptyState, Menu, PageHeader, Tabs } from '../components/ui';
import { deleteMappingTask, fetchMappingTasks, fetchWorkspaceView, getApiMode, listRcloneSources, runMappingTaskSync, setMappingTaskActive } from '../lib/api';
import { formatBytes, formatDate, formatRelative } from '../lib/format';
import { flowFromMapping, syncModeLabels, type FlowModel } from '../lib/mapping-view';
import type { ApiMode, MappingTaskItem, QueueJob, WorkspaceItem } from '../lib/types';

type StatusFilter = 'all' | 'active' | 'inactive';
type ViewMode = 'cards' | 'topology';

function syncState(item: MappingTaskItem, workspace?: WorkspaceItem): { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' } {
  if (item.status === 'inactive') return { label: '已停用', tone: 'neutral' };
  if (workspace?.attention_reasons.length) return { label: '需要处理', tone: 'bad' };
  if (workspace?.latest_sync_status === 'running') return { label: '正在同步', tone: 'warn' };
  if (workspace?.latest_sync_status === 'queued') return { label: '同步排队中', tone: 'warn' };
  if (workspace?.latest_sync_status === 'failed') return { label: '上次同步失败', tone: 'bad' };
  if (workspace && workspace.pending_change_count > 0) return { label: `${workspace.pending_change_count} 个变化待同步`, tone: 'neutral' };
  if (item.last_sync_at) return { label: '已是最新', tone: 'good' };
  return { label: '等待首次同步', tone: 'neutral' };
}

export function MappingTasksPage() {
  const queryClient = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [mode, setMode] = useState<ApiMode>(getApiMode());
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editing, setEditing] = useState<MappingTaskItem | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem('everdrive_mapping_view') === 'topology' ? 'topology' : 'cards';
    } catch {
      return 'cards';
    }
  });
  const [runningJobs, setRunningJobs] = useState<Record<string, QueueJob[]>>({});

  const query = useQuery({ queryKey: ['mapping-tasks'], queryFn: fetchMappingTasks, refetchInterval: 10000 });
  const workspaceQuery = useQuery({ queryKey: ['workspace-view'], queryFn: fetchWorkspaceView, refetchInterval: 10000 });
  const sourcesQuery = useQuery({ queryKey: ['rclone-sources'], queryFn: listRcloneSources, enabled: mode === 'live' });

  useEffect(() => {
    const onModeChanged = (event: Event) => setMode((event as CustomEvent<ApiMode>).detail);
    window.addEventListener('everdrive_api_mode_changed', onModeChanged);
    return () => window.removeEventListener('everdrive_api_mode_changed', onModeChanged);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('everdrive_mapping_view', view);
    } catch {
      // Remembering the view is a convenience only.
    }
  }, [view]);

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['mapping-tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['workspace-view'] });
  };

  const activeMutation = useMutation({
    mutationFn: (item: MappingTaskItem) => setMappingTaskActive(item.id, item.status !== 'active'),
    onSuccess: (_, item) => {
      toast('success', item.status === 'active' ? `已停用「${item.name}」` : `已启用「${item.name}」`);
      refreshAll();
    },
    onError: (error) => toast('error', '切换映射状态失败', errorText(error, ''))
  });

  const runSyncMutation = useMutation({
    mutationFn: (item: MappingTaskItem) => runMappingTaskSync(item.id),
    onSuccess: (response, item) => {
      setRunningJobs((current) => ({ ...current, [item.id]: response.jobs }));
      toast('info', `已开始同步「${item.name}」`, '依次执行扫描、重命名检测和上传同步。');
    },
    onError: (error) => toast('error', '手动触发同步失败', errorText(error, ''))
  });

  const deleteMutation = useMutation({
    mutationFn: (item: MappingTaskItem) => deleteMappingTask(item.id),
    onSuccess: (_, item) => {
      toast('success', `已删除映射「${item.name}」`, '云端已备份的文件保持不变。');
      refreshAll();
    },
    onError: (error) => toast('error', '删除映射失败', errorText(error, ''))
  });

  const items = query.data?.items ?? [];
  const workspaceById = useMemo(() => new Map((workspaceQuery.data?.items ?? []).map((item) => [item.mapping_task_id, item])), [workspaceQuery.data]);
  const sources = sourcesQuery.data?.items ?? [];

  const visible = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return [item.name, item.local_path, item.source_path, ...item.remotes.map((remote) => remote.displayName)].some((value) =>
      value?.toLowerCase().includes(keyword)
    );
  });
  const flows: FlowModel[] = visible.map((item) => flowFromMapping(item, sources));
  const counts = {
    all: items.length,
    active: items.filter((item) => item.status === 'active').length,
    inactive: items.filter((item) => item.status === 'inactive').length
  };

  const openCreate = () => {
    setEditing(null);
    setWizardOpen(true);
  };

  const requestToggle = async (item: MappingTaskItem) => {
    const deactivate = item.status === 'active';
    const ok = await confirm({
      title: deactivate ? `停用「${item.name}」？` : `启用「${item.name}」？`,
      description: deactivate ? '停用后不再自动同步，已备份的文件不受影响，随时可以重新启用。' : '启用后会按计划自动同步。',
      confirmLabel: deactivate ? '停用' : '启用'
    });
    if (ok) activeMutation.mutate(item);
  };

  const requestDelete = async (item: MappingTaskItem) => {
    const ok = await confirm({
      title: `删除映射「${item.name}」？`,
      description: (
        <>
          <p>删除后将停止同步这个映射，并从列表中移除。</p>
          <p>云端已经备份的文件不会被删除，需要时可以在云盘中手动清理。</p>
        </>
      ),
      confirmLabel: '删除映射',
      danger: true,
      requireText: item.name
    });
    if (ok) deleteMutation.mutate(item);
  };

  return (
    <div className="page">
      <PageHeader
        title="我的映射"
        description="每个映射把一个来源目录备份到一个或多个云盘。"
        actions={
          <>
            <button className="icon-button" aria-label="刷新" title="刷新" onClick={refreshAll}>
              <RefreshCw size={16} />
            </button>
            <button className="button-primary" onClick={openCreate}>
              <Plus size={16} />
              新建映射
            </button>
          </>
        }
      />

      {mode === 'mock' ? (
        <Callout tone="warn" title="当前为模拟数据">
          列表和编辑操作只在前端内存中模拟，不会写入真实后端。可在「设置」中切换为实时后端。
        </Callout>
      ) : null}

      <div className="toolbar">
        <label className="search-input">
          <Search size={16} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索映射、路径或云盘" />
        </label>
        <Tabs
          value={statusFilter}
          onChange={setStatusFilter}
          items={[
            { value: 'all', label: `全部 ${counts.all}` },
            { value: 'active', label: `启用中 ${counts.active}` },
            { value: 'inactive', label: `已停用 ${counts.inactive}` }
          ]}
        />
        <div className="toolbar__spacer" />
        <Tabs
          value={view}
          onChange={setView}
          items={[
            { value: 'cards', label: '流向', icon: <LayoutList size={15} /> },
            { value: 'topology', label: '拓扑', icon: <Network size={15} /> }
          ]}
        />
      </div>

      {query.isLoading ? (
        <div className="skeleton-list">
          {[0, 1].map((key) => (
            <div key={key} className="skeleton skeleton--card" />
          ))}
        </div>
      ) : null}
      {query.error ? (
        <Callout tone="bad" title="加载映射失败">
          {errorText(query.error, '请稍后重试。')}
        </Callout>
      ) : null}

      {query.data && items.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<FolderSync size={28} />}
            title="还没有映射"
            description="创建第一个映射：选择要备份的目录，再选择备份到哪些云盘。"
            action={
              <button className="button-primary" onClick={openCreate}>
                <Plus size={16} />
                新建映射
              </button>
            }
          />
        </section>
      ) : null}

      {query.data && items.length > 0 && visible.length === 0 ? <p className="muted">没有符合筛选条件的映射。</p> : null}

      {view === 'topology' && flows.length > 0 ? (
        <section className="panel">
          <TopologyView flows={flows} />
        </section>
      ) : null}

      {view === 'cards' ? (
        <div className="mapping-list">
          {visible.map((item, index) => {
            const workspace = workspaceById.get(item.id);
            const state = syncState(item, workspace);
            const jobs = runningJobs[item.id];
            const pending =
              (activeMutation.isPending && activeMutation.variables?.id === item.id) || (deleteMutation.isPending && deleteMutation.variables?.id === item.id);
            return (
              <article key={item.id} className={`mapping-card ${item.status === 'inactive' ? 'mapping-card--inactive' : ''}`}>
                <header className="mapping-card__head">
                  <div className="mapping-card__title">
                    <h3>{item.name}</h3>
                    <div className="chip-row">
                      <Badge tone={state.tone}>{state.label}</Badge>
                      <span className="chip">{syncModeLabels[item.sync_mode]}</span>
                      {item.encryption_enabled ? <span className="chip">已加密</span> : null}
                      {workspace ? (
                        <span className="chip">
                          {workspace.file_count.toLocaleString()} 个文件 · {formatBytes(workspace.total_size)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mapping-card__actions">
                    <button
                      className="button-primary"
                      disabled={item.status !== 'active' || Boolean(jobs) || (runSyncMutation.isPending && runSyncMutation.variables?.id === item.id)}
                      onClick={() => runSyncMutation.mutate(item)}
                    >
                      <Play size={15} />
                      {jobs ? '同步中' : '立即同步'}
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        setEditing(item);
                        setWizardOpen(true);
                      }}
                    >
                      <Pencil size={15} />
                      编辑
                    </button>
                    <Menu
                      items={[
                        {
                          label: item.status === 'active' ? '停用' : '启用',
                          icon: item.status === 'active' ? <Pause size={15} /> : <Play size={15} />,
                          onSelect: () => void requestToggle(item),
                          disabled: pending
                        },
                        { label: '删除映射', icon: <Trash2 size={15} />, danger: true, onSelect: () => void requestDelete(item), disabled: pending }
                      ]}
                    />
                  </div>
                </header>

                <MappingFlow flow={flows[index]!} />

                {workspace?.attention_reasons.length ? (
                  <div className="reason-list">
                    {workspace.attention_reasons.map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                ) : null}

                <footer className="mapping-card__foot">
                  <span title={formatDate(item.last_sync_at)}>上次成功同步：{formatRelative(item.last_sync_at)}</span>
                  {workspace?.latest_sync_finished_at && workspace.latest_sync_finished_at !== item.last_sync_at ? (
                    <span title={formatDate(workspace.latest_sync_finished_at)}>最近一次尝试：{formatRelative(workspace.latest_sync_finished_at)}</span>
                  ) : null}
                  {jobs ? (
                    <SyncProgress
                      jobs={jobs}
                      onDone={(failed) => {
                        setRunningJobs((current) => {
                          const next = { ...current };
                          delete next[item.id];
                          return next;
                        });
                        toast(
                          failed ? 'error' : 'success',
                          failed ? `「${item.name}」同步失败` : `「${item.name}」同步完成`,
                          failed ? '可在「活动记录」中查看详情。' : undefined
                        );
                        refreshAll();
                      }}
                    />
                  ) : null}
                </footer>
              </article>
            );
          })}
        </div>
      ) : null}

      <MappingWizard
        open={wizardOpen}
        editing={editing}
        onClose={() => setWizardOpen(false)}
        onSaved={(name, isNew) => {
          toast('success', isNew ? `已创建映射「${name}」` : `已保存「${name}」`);
          refreshAll();
        }}
      />
    </div>
  );
}
