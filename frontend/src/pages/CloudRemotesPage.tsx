import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cloud, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { errorText, useFeedback } from '../components/feedback';
import { Badge, Callout, Drawer, EmptyState, Menu, PageHeader, PathText, ProgressBar } from '../components/ui';
import { createCloudRemote, deleteCloudRemote, fetchCloudRemotes, listRcloneRemoteOptions, updateRemoteSettings } from '../lib/api';
import { bytesToGigabyteInput, formatBytes, formatPercent, formatRelative, gigabytesToBytes } from '../lib/format';
import { displaySourcePath, fallbackDestination, healthLabels, healthTone, roleLabels, type TargetRole } from '../lib/mapping-view';
import type { RemotesListResponse } from '../lib/types';

type RemoteItem = RemotesListResponse['items'][number];

type CapacityFormState = {
  displayName: string;
  remoteName: string;
  totalCapacity: string;
  reservedCapacity: string;
  warningThresholdPercent: number;
  remoteRootPath: string;
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
};

const emptyForm = (): CapacityFormState => ({
  displayName: '',
  remoteName: '',
  totalCapacity: '',
  reservedCapacity: '',
  warningThresholdPercent: 85,
  remoteRootPath: '',
  cloudTrashEnabled: false,
  cloudTrashBasePath: '.everdrive-trash'
});

function toCapacityForm(item: RemoteItem): CapacityFormState {
  return {
    displayName: item.displayName,
    remoteName: item.remoteName,
    totalCapacity: bytesToGigabyteInput(item.capacity.totalCapacityBytes),
    reservedCapacity: bytesToGigabyteInput(item.capacity.reservedCapacityBytes),
    warningThresholdPercent: item.capacity.warningThresholdPercent,
    remoteRootPath: item.remoteRootPath,
    cloudTrashEnabled: item.cloudTrashEnabled,
    cloudTrashBasePath: item.cloudTrashBasePath
  };
}

export function CloudRemotesPage() {
  const queryClient = useQueryClient();
  const { toast, confirm } = useFeedback();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RemoteItem | null>(null);
  const [form, setForm] = useState<CapacityFormState>(emptyForm);
  const query = useQuery({ queryKey: ['cloud-remotes'], queryFn: fetchCloudRemotes, refetchInterval: 10000 });
  const rcloneOptionsQuery = useQuery({ queryKey: ['rclone-remote-options'], queryFn: listRcloneRemoteOptions, refetchInterval: 10000 });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['cloud-remotes'] });
    void queryClient.invalidateQueries({ queryKey: ['rclone-remote-options'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        displayName: form.displayName.trim(),
        remoteName: form.remoteName,
        totalCapacity: gigabytesToBytes(form.totalCapacity),
        reservedCapacity: gigabytesToBytes(form.reservedCapacity),
        warningThresholdPercent: Number(form.warningThresholdPercent),
        remoteRootPath: form.remoteRootPath.trim(),
        cloudTrashEnabled: form.cloudTrashEnabled,
        cloudTrashBasePath: form.cloudTrashBasePath
      };
      return editingItem ? updateRemoteSettings(editingItem.id, payload) : createCloudRemote(payload);
    },
    onSuccess: () => {
      toast('success', editingItem ? `已保存「${form.displayName}」` : `已添加云盘「${form.displayName}」`);
      setDrawerOpen(false);
      invalidate();
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (item: RemoteItem) => deleteCloudRemote(item.id),
    onSuccess: (_, item) => {
      toast('success', `已删除云盘「${item.displayName}」`);
      invalidate();
    },
    onError: (error) => toast('error', '删除云盘失败', errorText(error, ''))
  });

  const openEditor = (item: RemoteItem | null) => {
    setEditingItem(item);
    setForm(item ? toCapacityForm(item) : emptyForm());
    saveMutation.reset();
    setDrawerOpen(true);
  };

  const requestDelete = async (item: RemoteItem) => {
    const ok = await confirm({
      title: `删除云盘「${item.displayName}」？`,
      description: item.mappedDirectories.length
        ? `这个云盘仍被 ${item.mappedDirectories.length} 个映射使用，删除前请先在映射中解除绑定。`
        : '只会从 everDrive 中移除，不会删除云盘上的文件，也不会删除底层 rclone 配置。',
      confirmLabel: '删除',
      danger: true
    });
    if (ok) deleteMutation.mutate(item);
  };

  const items = query.data?.items ?? [];

  return (
    <div className="page">
      <PageHeader
        title="云盘"
        description="everDrive 可以备份到的业务云盘，以及每个云盘承载了哪些映射。"
        actions={
          <>
            <button className="icon-button" aria-label="刷新" title="刷新" onClick={invalidate}>
              <RefreshCw size={16} />
            </button>
            <button className="button-primary" onClick={() => openEditor(null)}>
              <Plus size={16} />
              添加云盘
            </button>
          </>
        }
      />
      {query.error ? <Callout tone="bad">加载云盘列表失败：{errorText(query.error, '')}</Callout> : null}
      {query.isLoading ? (
        <div className="cards-grid">
          {[0, 1, 2].map((key) => (
            <div key={key} className="skeleton skeleton--card" />
          ))}
        </div>
      ) : null}

      {query.data && items.length === 0 ? (
        <section className="panel">
          <EmptyState
            icon={<Cloud size={28} />}
            title="还没有云盘"
            description="先在「连接」中配置 rclone remote，再在这里添加为业务云盘。"
            action={
              <button className="button-primary" onClick={() => openEditor(null)}>
                <Plus size={16} />
                添加云盘
              </button>
            }
          />
        </section>
      ) : null}

      <section className="cards-grid">
        {items.map((item) => {
          const percent = item.capacity.usagePercent;
          const known = item.capacity.realUsageAvailable || Number(item.capacity.totalCapacityBytes) > 0;
          return (
            <article className="remote-card" key={item.id}>
              <header className="remote-card__head">
                <div className="remote-card__title">
                  <span className="remote-card__icon">
                    <Cloud size={18} />
                  </span>
                  <div>
                    <h3>{item.displayName}</h3>
                    <PathText value={fallbackDestination(item.remoteName, item.remoteRootPath)} max={34} />
                  </div>
                </div>
                <div className="remote-card__actions">
                  <Badge tone={healthTone(item.healthStatus)}>{healthLabels[item.healthStatus] ?? item.healthStatus}</Badge>
                  <Menu
                    items={[
                      { label: '编辑设置', icon: <Pencil size={15} />, onSelect: () => openEditor(item) },
                      { label: '删除云盘', icon: <Trash2 size={15} />, danger: true, onSelect: () => void requestDelete(item) }
                    ]}
                  />
                </div>
              </header>

              <div className="usage">
                <div className="usage__numbers">
                  <b>{known ? formatPercent(percent) : '—'}</b>
                  <span className="muted">
                    已用 {item.capacity.realUsageAvailable ? formatBytes(item.capacity.usedCapacityBytes) : '不可读取'} / 剩余{' '}
                    {formatBytes(item.capacity.remainingCapacityBytes)}
                  </span>
                </div>
                <ProgressBar percent={percent} threshold={item.capacity.warningThresholdPercent} />
                {item.capacity.alert ? <small className="text-warn">已达到告警阈值 {item.capacity.warningThresholdPercent}%</small> : null}
              </div>

              <div className="remote-card__section">
                <span className="remote-card__label">承载的映射（{item.mappedDirectories.length}）</span>
                {item.mappedDirectories.length ? (
                  <ul className="mapped-list">
                    {item.mappedDirectories.map((mapping) => (
                      <li key={mapping.mappingTaskId} className={mapping.mappingTaskActive ? '' : 'mapped-list__item--inactive'}>
                        <span className={`role-badge role-badge--${mapping.role}`}>{roleLabels[mapping.role as TargetRole] ?? mapping.role}</span>
                        <Link to="/mapping-tasks">{mapping.mappingTaskName}</Link>
                        <span className="mono muted mapped-list__path" title={displaySourcePath(mapping.localPath)}>
                          {displaySourcePath(mapping.localPath)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">暂未被任何映射使用。</p>
                )}
              </div>

              <footer className="remote-card__foot">
                <span className="chip">{item.cloudTrashEnabled ? `回收站：${item.cloudTrashBasePath}` : '回收站未开启'}</span>
                <span className="muted">最近检查 {formatRelative(item.lastCheckedAt)}</span>
              </footer>
            </article>
          );
        })}
      </section>

      <Drawer
        open={drawerOpen}
        title={editingItem ? `编辑云盘：${editingItem.displayName}` : '添加云盘'}
        subtitle="业务云盘 = 一个 rclone remote + 容量与回收站设置。"
        onClose={() => setDrawerOpen(false)}
        footer={
          <>
            {saveMutation.error ? <p className="error drawer__error">{errorText(saveMutation.error, '保存失败')}</p> : null}
            <div className="drawer__foot-actions">
              <button onClick={() => setDrawerOpen(false)}>取消</button>
              <button
                className="button-primary"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !form.displayName.trim() || !form.remoteName}
              >
                {saveMutation.isPending ? '正在保存...' : editingItem ? '保存' : '添加云盘'}
              </button>
            </div>
          </>
        }
      >
        <div className="form-stack">
          <label className="field">
            <span>名称</span>
            <input
              value={form.displayName}
              onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
              placeholder="例如：Google Drive 个人"
            />
            <small>在映射中选择云盘时显示的名称。</small>
          </label>
          <label className="field">
            <span>底层 rclone remote</span>
            <select value={form.remoteName} onChange={(event) => setForm((prev) => ({ ...prev, remoteName: event.target.value }))}>
              <option value="">请选择底层 remote</option>
              {(rcloneOptionsQuery.data?.items ?? []).map((option) => (
                <option key={option.remoteName} value={option.remoteName} disabled={option.boundRemoteId !== editingItem?.id && !option.available}>
                  {option.remoteName}
                  {!option.available && option.boundDisplayName ? `（已绑定到 ${option.boundDisplayName}）` : ''}
                </option>
              ))}
            </select>
            <small>
              没有想要的？先到 <Link to="/rclone-config">连接</Link> 中配置。
            </small>
          </label>
          <label className="field">
            <span>远端根路径 / 容器前缀（通常留空）</span>
            <input
              className="mono"
              value={form.remoteRootPath}
              onChange={(event) => setForm((prev) => ({ ...prev, remoteRootPath: event.target.value }))}
              placeholder="例如 user@example.com"
            />
            <small>只有像 Blomp 这类必须先进入容器路径的 remote 才需要填写。所有映射都会写在这个路径之下。</small>
          </label>
          <div className="form-grid form-grid--2">
            <label className="field">
              <span>总容量（GB）</span>
              <input
                type="number"
                min="0"
                value={form.totalCapacity}
                onChange={(event) => setForm((prev) => ({ ...prev, totalCapacity: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>预留容量（GB）</span>
              <input
                type="number"
                min="0"
                value={form.reservedCapacity}
                onChange={(event) => setForm((prev) => ({ ...prev, reservedCapacity: event.target.value }))}
              />
            </label>
            <label className="field">
              <span>告警阈值（%）</span>
              <input
                type="number"
                min="1"
                max="100"
                value={form.warningThresholdPercent}
                onChange={(event) => setForm((prev) => ({ ...prev, warningThresholdPercent: Number(event.target.value) }))}
              />
            </label>
            <label className="field">
              <span>已用容量（自动检测）</span>
              <input
                value={
                  editingItem && editingItem.capacity.realUsageAvailable
                    ? `${bytesToGigabyteInput(editingItem.capacity.usedCapacityBytes)} GB`
                    : editingItem
                      ? '不可读取'
                      : '添加后检测'
                }
                readOnly
              />
            </label>
          </div>
          <small className="muted">总容量手动维护；已用容量优先读取云盘真实用量。预留容量不允许 everDrive 使用，会从可用容量中扣除。</small>

          <label className="toggle-card">
            <input
              type="checkbox"
              checked={form.cloudTrashEnabled}
              onChange={(event) => setForm((prev) => ({ ...prev, cloudTrashEnabled: event.target.checked }))}
            />
            <span>
              <strong>启用自建云端回收站</strong>
              <small>镜像模式删除文件时，先移到回收站目录，按设置中的保留天数自动清理。</small>
            </span>
          </label>
          {form.cloudTrashEnabled ? (
            <label className="field">
              <span>回收站路径</span>
              <input
                className="mono"
                value={form.cloudTrashBasePath}
                onChange={(event) => setForm((prev) => ({ ...prev, cloudTrashBasePath: event.target.value }))}
              />
            </label>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
