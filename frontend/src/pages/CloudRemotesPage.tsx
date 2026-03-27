import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { RemoteCard } from '../components/RemoteCard';
import { fetchCloudRemotes, updateRemoteSettings } from '../lib/api';
import type { RemotesListResponse } from '../lib/types';

type CapacityFormState = {
  totalCapacity: string;
  reservedCapacity: string;
  warningThresholdPercent: number;
  cloudTrashEnabled: boolean;
  cloudTrashBasePath: string;
};

function toCapacityForm(item: RemotesListResponse['items'][number]): CapacityFormState {
  return {
    totalCapacity: item.capacity.totalCapacityBytes,
    reservedCapacity: item.capacity.reservedCapacityBytes,
    warningThresholdPercent: item.capacity.warningThresholdPercent,
    cloudTrashEnabled: item.cloudTrashEnabled,
    cloudTrashBasePath: item.cloudTrashBasePath
  };
}

export function CloudRemotesPage() {
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState<RemotesListResponse['items'][number] | null>(null);
  const [form, setForm] = useState<CapacityFormState>({
    totalCapacity: '',
    reservedCapacity: '',
    warningThresholdPercent: 85,
    cloudTrashEnabled: false,
    cloudTrashBasePath: '.everdrive-trash'
  });
  const query = useQuery({
    queryKey: ['cloud-remotes'],
    queryFn: fetchCloudRemotes,
    refetchInterval: 10000
  });
  const mutation = useMutation({
    mutationFn: async () => {
      if (!editingItem) {
        throw new Error('missing remote');
      }
      return updateRemoteSettings(editingItem.id, {
        totalCapacity: form.totalCapacity,
        reservedCapacity: form.reservedCapacity,
        warningThresholdPercent: Number(form.warningThresholdPercent),
        cloudTrashEnabled: form.cloudTrashEnabled,
        cloudTrashBasePath: form.cloudTrashBasePath
      });
    },
    onSuccess: () => {
      setEditingItem(null);
      void queryClient.invalidateQueries({ queryKey: ['cloud-remotes'] });
    }
  });

  return (
    <div className="page">
      <header className="page__header">
        <h1>云盘列表</h1>
        <button onClick={() => query.refetch()}>刷新列表</button>
      </header>
      {query.isLoading ? <p>正在加载云盘列表...</p> : null}
      {query.error ? <p className="error">加载云盘列表失败。</p> : null}

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
            </div>
          </div>
        ))}
      </section>

      {editingItem ? (
        <section className="panel">
          <div className="panel__head">
            <h3>编辑容量：{editingItem.displayName}</h3>
            <button onClick={() => setEditingItem(null)}>取消</button>
          </div>
          <div className="settings-grid">
            <label>
              总容量（字节）
              <input value={form.totalCapacity} onChange={(e) => setForm((prev) => ({ ...prev, totalCapacity: e.target.value }))} />
            </label>
            <label>
              预留容量（字节）
              <input value={form.reservedCapacity} onChange={(e) => setForm((prev) => ({ ...prev, reservedCapacity: e.target.value }))} />
            </label>
            <label>
              已用容量（自动检测）
              <input value={editingItem.capacity.usedCapacityBytes} readOnly />
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
          <p className="muted">总容量手动维护；已用容量由系统自动统计；自建云端回收站仅在镜像模式删除时生效。</p>
          {mutation.error ? <p className="error">保存容量设置失败。</p> : null}
          <div className="toggle-row">
            <button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending ? '正在保存...' : '保存容量设置'}
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
