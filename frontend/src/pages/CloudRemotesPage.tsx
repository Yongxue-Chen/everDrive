import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RemoteCard } from '../components/RemoteCard';
import { bytesToGigabyteInput, gigabytesToBytes } from '../lib/format';
import { createCloudRemote, deleteCloudRemote, fetchCloudRemotes, listRcloneRemoteOptions, updateRemoteSettings } from '../lib/api';
import type { RemotesListResponse } from '../lib/types';

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

function toCapacityForm(item: RemotesListResponse['items'][number]): CapacityFormState {
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
  const [editingItem, setEditingItem] = useState<RemotesListResponse['items'][number] | null>(null);
  const [form, setForm] = useState<CapacityFormState>({
    displayName: '',
    remoteName: '',
    totalCapacity: '',
    reservedCapacity: '',
    warningThresholdPercent: 85,
    remoteRootPath: '',
    cloudTrashEnabled: false,
    cloudTrashBasePath: '.everdrive-trash'
  });
  const query = useQuery({
    queryKey: ['cloud-remotes'],
    queryFn: fetchCloudRemotes,
    refetchInterval: 10000
  });
  const rcloneOptionsQuery = useQuery({
    queryKey: ['rclone-remote-options'],
    queryFn: listRcloneRemoteOptions,
    refetchInterval: 10000
  });
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

      if (editingItem) {
        return updateRemoteSettings(editingItem.id, payload);
      }
      return createCloudRemote(payload);
    },
    onSuccess: () => {
      setEditingItem(null);
      setForm({
        displayName: '',
        remoteName: '',
        totalCapacity: '',
        reservedCapacity: '',
        warningThresholdPercent: 85,
        remoteRootPath: '',
        cloudTrashEnabled: false,
        cloudTrashBasePath: '.everdrive-trash'
      });
      void queryClient.invalidateQueries({ queryKey: ['cloud-remotes'] });
      void queryClient.invalidateQueries({ queryKey: ['rclone-remote-options'] });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: async (remoteId: string) => deleteCloudRemote(remoteId),
    onSuccess: () => {
      if (editingItem) {
        setEditingItem(null);
      }
      void queryClient.invalidateQueries({ queryKey: ['cloud-remotes'] });
      void queryClient.invalidateQueries({ queryKey: ['rclone-remote-options'] });
    }
  });

  return (
    <div className="page">
      <header className="page__header">
        <h1>云盘列表</h1>
        <button
          onClick={() => {
            void query.refetch();
            void rcloneOptionsQuery.refetch();
          }}
        >
          刷新列表
        </button>
      </header>
      {query.isLoading ? <p>正在加载云盘列表...</p> : null}
      {query.error ? <p className="error">加载云盘列表失败。</p> : null}
      {rcloneOptionsQuery.error ? <p className="error">加载底层 rclone remote 列表失败。</p> : null}

      <section className="cards-grid">
        {(query.data?.items ?? []).map((item) => (
          <div className="panel" key={item.id}>
            <RemoteCard
              name={item.displayName}
              healthStatus={item.healthStatus}
              usagePercent={item.capacity.usagePercent}
              usedCapacity={item.capacity.usedCapacityBytes}
              remainingCapacity={item.capacity.remainingCapacityBytes}
              warningFlag={item.capacity.alert}
              usageKnown={item.capacity.realUsageAvailable}
            />
            <div className="panel__actions remote-actions">
              <button
                onClick={() => {
                  setEditingItem(item);
                  setForm(toCapacityForm(item));
                }}
              >
                编辑容量
              </button>
              <button
                onClick={() => {
                  if (!window.confirm(`确认删除业务云盘“${item.displayName}”吗？`)) {
                    return;
                  }
                  deleteMutation.mutate(item.id);
                }}
                disabled={deleteMutation.isPending}
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </section>
      {query.data && query.data.items.length === 0 ? (
        <section className="panel panel--warning">
          <strong>当前还没有业务云盘。</strong>
          <p className="muted">请在下方手动新增业务云盘，再从已配置的 rclone remote 中选择一个绑定。</p>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel__head">
          <h3>{editingItem ? `编辑业务云盘：${editingItem.displayName}` : '新增业务云盘'}</h3>
          {editingItem ? (
            <button
              onClick={() => {
                setEditingItem(null);
                setForm({
                  displayName: '',
                  remoteName: '',
                  totalCapacity: '',
                  reservedCapacity: '',
                  warningThresholdPercent: 85,
                  remoteRootPath: '',
                  cloudTrashEnabled: false,
                  cloudTrashBasePath: '.everdrive-trash'
                });
              }}
            >
              取消
            </button>
          ) : null}
        </div>
        <div className="settings-grid">
          <label>
            业务名称
            <input value={form.displayName} onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))} />
          </label>
          <label>
            底层 rclone remote
            <select value={form.remoteName} onChange={(e) => setForm((prev) => ({ ...prev, remoteName: e.target.value }))}>
              <option value="">请选择底层 remote</option>
              {(rcloneOptionsQuery.data?.items ?? []).map((option) => (
                <option
                  key={option.remoteName}
                  value={option.remoteName}
                  disabled={option.boundRemoteId !== editingItem?.id && !option.available}
                >
                  {option.remoteName}
                  {!option.available && option.boundDisplayName ? `（已绑定到 ${option.boundDisplayName}）` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            总容量（GB）
            <input value={form.totalCapacity} onChange={(e) => setForm((prev) => ({ ...prev, totalCapacity: e.target.value }))} />
          </label>
          <label>
            预留容量（GB）
            <input value={form.reservedCapacity} onChange={(e) => setForm((prev) => ({ ...prev, reservedCapacity: e.target.value }))} />
          </label>
          <label>
            已用容量（GB，自动检测）
            <input
              value={editingItem && editingItem.capacity.realUsageAvailable ? bytesToGigabyteInput(editingItem.capacity.usedCapacityBytes) : '新建后检测'}
              readOnly
            />
          </label>
          <label>
            告警阈值（%）
            <input
              type="number"
              value={form.warningThresholdPercent}
              onChange={(e) => setForm((prev) => ({ ...prev, warningThresholdPercent: Number(e.target.value) }))}
            />
          </label>
          <label>
            远端根路径 / 容器前缀
            <input
              value={form.remoteRootPath}
              onChange={(e) => setForm((prev) => ({ ...prev, remoteRootPath: e.target.value }))}
              placeholder="例如 user@example.com"
            />
          </label>
          <label>
            启用自建云端回收站
            <input
              type="checkbox"
              checked={form.cloudTrashEnabled}
              onChange={(e) => setForm((prev) => ({ ...prev, cloudTrashEnabled: e.target.checked }))}
            />
          </label>
          {form.cloudTrashEnabled ? (
            <label>
              回收站基础路径
              <input value={form.cloudTrashBasePath} onChange={(e) => setForm((prev) => ({ ...prev, cloudTrashBasePath: e.target.value }))} />
            </label>
          ) : null}
        </div>
        <p className="muted">总容量手动维护；已用容量优先读取云盘真实已用；如果云盘接口不支持读取，会显示“不可读取”；自建云端回收站仅在镜像模式删除时生效。</p>
        <p className="muted">业务名称用于映射页面选择；底层 rclone remote 仅用于实际执行和健康检查。</p>
        <p className="muted">“远端根路径 / 容器前缀”默认留空。只有像 Blomp 这类必须先进入容器路径的 remote 才需要填写，例如 `user@example.com`。</p>
        <p className="muted">预留容量是给该云盘预先保留、不允许 everDrive 使用的空间，会直接从可用容量里扣掉。</p>
        {saveMutation.error ? <p className="error">保存业务云盘设置失败。</p> : null}
        {deleteMutation.error ? <p className="error">删除业务云盘失败。</p> : null}
        <div className="toggle-row">
          <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? '正在保存...' : editingItem ? '保存业务云盘设置' : '新增业务云盘'}
          </button>
        </div>
      </section>
    </div>
  );
}
