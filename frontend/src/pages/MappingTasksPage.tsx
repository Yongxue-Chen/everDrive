import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { LocalPathPicker } from '../components/LocalPathPicker';
import { MappingTable } from '../components/MappingTable';
import {
  syncCloudRemotes,
  createMappingTask,
  deleteMappingTask,
  fetchCloudRemotes,
  fetchMappingTasks,
  getApiMode,
  runMappingTaskSync,
  setMappingTaskActive,
  updateMappingTask
} from '../lib/api';
import type { ApiMode, MappingTaskItem } from '../lib/types';

type BindingForm = {
  remoteId: string;
  priority: number;
  remoteBasePath: string;
};

type MappingFormState = {
  name: string;
  localPath: string;
  syncMode: 'archive' | 'mirror';
  encryptionEnabled: boolean;
  redundancyEnabled: boolean;
  splitEnabled: boolean;
  expectedDataSizeBytes: string;
  remoteBindings: BindingForm[];
};

const createEmptyForm = (): MappingFormState => ({
  name: '',
  localPath: '',
  syncMode: 'archive',
  encryptionEnabled: false,
  redundancyEnabled: false,
  splitEnabled: false,
  expectedDataSizeBytes: '',
  remoteBindings: [{ remoteId: '', priority: 1, remoteBasePath: '' }]
});

function mapItemToForm(item: MappingTaskItem): MappingFormState {
  return {
    name: item.name,
    localPath: item.local_path,
    syncMode: item.sync_mode,
    encryptionEnabled: item.encryption_enabled,
    redundancyEnabled: item.redundancy_enabled,
    splitEnabled: item.split_enabled,
    expectedDataSizeBytes: '',
    remoteBindings: item.remotes.map((remote, index) => ({
      remoteId: remote.remoteId,
      priority: index + 1,
      remoteBasePath: remote.remoteBasePath
    }))
  };
}

export function MappingTasksPage() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ApiMode>(getApiMode());
  const [editingItem, setEditingItem] = useState<MappingTaskItem | null>(null);
  const [form, setForm] = useState<MappingFormState>(createEmptyForm());
  const [isPathPickerOpen, setIsPathPickerOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [runSyncNotice, setRunSyncNotice] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['mapping-tasks'],
    queryFn: fetchMappingTasks,
    refetchInterval: 10000
  });
  const remotesQuery = useQuery({
    queryKey: ['cloud-remotes'],
    queryFn: fetchCloudRemotes,
    refetchInterval: 10000
  });

  useEffect(() => {
    const onModeChanged = (event: Event) => {
      const custom = event as CustomEvent<ApiMode>;
      setMode(custom.detail);
    };
    window.addEventListener('everdrive_api_mode_changed', onModeChanged);
    return () => window.removeEventListener('everdrive_api_mode_changed', onModeChanged);
  }, []);

  const syncRemotesMutation = useMutation({
    mutationFn: syncCloudRemotes,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cloud-remotes'] });
    }
  });

  useEffect(() => {
    if (mode !== 'live') {
      return;
    }
    syncRemotesMutation.mutate();
  }, [mode]);

  const saveMutation = useMutation({
    mutationFn: async (payload: MappingFormState) => {
      const body = {
        name: payload.name.trim(),
        localPath: payload.localPath.trim(),
        syncMode: payload.syncMode,
        encryptionEnabled: payload.encryptionEnabled,
        redundancyEnabled: payload.redundancyEnabled,
        splitEnabled: payload.splitEnabled,
        expectedDataSizeBytes: payload.expectedDataSizeBytes.trim() || undefined,
        remoteBindings: payload.remoteBindings.map((binding) => ({
          remoteId: binding.remoteId,
          priority: Number(binding.priority),
          remoteBasePath: binding.remoteBasePath.trim()
        }))
      };

      if (editingItem) {
        return updateMappingTask(editingItem.id, body);
      }
      return createMappingTask(body);
    },
    onSuccess: () => {
      setSubmitError(null);
      setRunSyncNotice(null);
      setEditingItem(null);
      setForm(createEmptyForm());
      void queryClient.invalidateQueries({ queryKey: ['mapping-tasks'] });
    },
    onError: (error) => {
      setSubmitError(error instanceof Error ? error.message : '保存映射失败');
    }
  });

  const activeMutation = useMutation({
    mutationFn: async (item: MappingTaskItem) => setMappingTaskActive(item.id, item.status !== 'active'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mapping-tasks'] });
    }
  });

  const runSyncMutation = useMutation({
    mutationFn: async (item: MappingTaskItem) => runMappingTaskSync(item.id),
    onSuccess: (_, item) => {
      setRunSyncNotice(`已开始同步“${item.name}”。系统会依次执行扫描、重命名检测和同步。`);
      void queryClient.invalidateQueries({ queryKey: ['mapping-tasks'] });
    },
    onError: () => {
      setRunSyncNotice(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (item: MappingTaskItem) => deleteMappingTask(item.id),
    onSuccess: (_, item) => {
      if (editingItem?.id === item.id) {
        setEditingItem(null);
        setForm(createEmptyForm());
      }
      void queryClient.invalidateQueries({ queryKey: ['mapping-tasks'] });
    }
  });

  const resetForm = () => {
    setEditingItem(null);
    setSubmitError(null);
    setRunSyncNotice(null);
    setForm(createEmptyForm());
  };

  const startEdit = (item: MappingTaskItem) => {
    setSubmitError(null);
    setRunSyncNotice(null);
    setEditingItem(item);
    setForm(mapItemToForm(item));
  };

  const submit = () => {
    setSubmitError(null);
    setRunSyncNotice(null);
    saveMutation.mutate(form);
  };

  const pendingTaskId =
    (activeMutation.isPending ? activeMutation.variables?.id : null) ??
    (deleteMutation.isPending ? deleteMutation.variables?.id : null) ??
    (runSyncMutation.isPending ? runSyncMutation.variables?.id : null);

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>映射任务管理</h1>
          <p className="muted">当前数据源：{mode === 'mock' ? '模拟数据' : '实时后端'}</p>
        </div>
        <div className="panel__actions">
          <button onClick={resetForm}>新建映射</button>
          <button
            onClick={async () => {
              if (mode === 'live') {
                await syncRemotesMutation.mutateAsync();
                await remotesQuery.refetch();
              }
              await query.refetch();
            }}
          >
            刷新列表
          </button>
        </div>
      </header>

      {mode === 'mock' ? (
        <section className="panel panel--warning">
          <strong>当前为模拟数据。</strong>
          <p className="muted">列表和编辑操作只会在前端内存中模拟，不会写入真实后端。</p>
        </section>
      ) : null}

      <section className="mapping-layout">
        <div className="mapping-layout__main">
          {query.isLoading ? <p>正在加载映射任务...</p> : null}
          {query.error ? <p className="error">加载映射任务失败。</p> : null}
          {query.data ? (
            <MappingTable
              items={query.data.items}
              pendingTaskId={pendingTaskId}
              onEdit={startEdit}
              onRunSync={(item) => {
                runSyncMutation.mutate(item);
              }}
              onToggleActive={(item) => {
                const nextAction = item.status === 'active' ? '停用' : '启用';
                if (!window.confirm(`确认要${nextAction}映射“${item.name}”吗？`)) {
                  return;
                }
                activeMutation.mutate(item);
              }}
              onDelete={(item) => {
                if (!window.confirm(`确认删除映射“${item.name}”吗？`)) {
                  return;
                }
                deleteMutation.mutate(item);
              }}
            />
          ) : null}
        </div>

        <aside className="panel mapping-form">
          <div className="panel__head">
            <h3>{editingItem ? `编辑映射：${editingItem.name}` : '新建映射'}</h3>
            {editingItem ? <button onClick={resetForm}>取消编辑</button> : null}
          </div>
          <p className="muted">自建云端回收站按云盘单独配置，仅在镜像模式删除时生效。</p>

          <div className="settings-grid mapping-form__grid">
            <label>
              映射名称
              <input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="例如：照片归档" />
            </label>
            <label>
              本地路径
              <div className="path-input">
                <input value={form.localPath} readOnly placeholder="请选择服务器目录" />
                <button onClick={() => setIsPathPickerOpen(true)}>选择目录</button>
              </div>
            </label>
            <label>
              同步模式
              <select value={form.syncMode} onChange={(e) => setForm((prev) => ({ ...prev, syncMode: e.target.value as 'archive' | 'mirror' }))}>
                <option value="archive">归档</option>
                <option value="mirror">镜像</option>
              </select>
            </label>
            {form.splitEnabled ? (
              <label>
                预估数据量（字节）
                <input
                  value={form.expectedDataSizeBytes}
                  onChange={(e) => setForm((prev) => ({ ...prev, expectedDataSizeBytes: e.target.value }))}
                  placeholder="用于校验分片总容量是否足够"
                />
              </label>
            ) : (
              <div className="panel panel--neutral">
                <strong>预估数据量</strong>
                <p className="muted">仅在分片模式下使用，用于校验多个远端总可用容量是否足够。</p>
              </div>
            )}
          </div>

          <div className="mapping-form__toggles">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.encryptionEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, encryptionEnabled: e.target.checked }))}
              />
              启用加密
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.redundancyEnabled}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    redundancyEnabled: e.target.checked,
                    splitEnabled: e.target.checked ? false : prev.splitEnabled
                  }))
                }
              />
              启用冗余
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={form.splitEnabled}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    splitEnabled: e.target.checked,
                    redundancyEnabled: e.target.checked ? false : prev.redundancyEnabled
                  }))
                }
              />
              启用分片
            </label>
          </div>

          <section className="mapping-form__bindings">
            <div className="panel__head">
              <h4>远端绑定</h4>
              <button
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    remoteBindings: [
                      ...prev.remoteBindings,
                      { remoteId: remotesQuery.data?.items[0]?.id ?? '', priority: prev.remoteBindings.length + 1, remoteBasePath: '' }
                    ]
                  }))
                }
              >
                添加远端
              </button>
            </div>

            {syncRemotesMutation.isPending ? <p>正在从 rclone 同步远端列表...</p> : null}
            {syncRemotesMutation.error ? <p className="error">同步 rclone 远端失败。</p> : null}
            {remotesQuery.isLoading ? <p>正在加载云盘列表...</p> : null}
            {remotesQuery.error ? <p className="error">加载云盘列表失败。</p> : null}
            {remotesQuery.data && remotesQuery.data.items.length === 0 ? (
              <div className="panel panel--warning">
                <strong>当前没有可绑定云盘。</strong>
                <p className="muted">请先在 rclone 中配置 remote；本页刷新时会自动重新检测。</p>
              </div>
            ) : null}

            {form.remoteBindings.map((binding, index) => (
              <div className="binding-row" key={`${index}-${binding.remoteId}`}>
                <label>
                  云盘
                  <select
                    value={binding.remoteId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        remoteBindings: prev.remoteBindings.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, remoteId: e.target.value } : item
                        )
                      }))
                    }
                  >
                    <option value="">请选择云盘</option>
                    {(remotesQuery.data?.items ?? []).map((remote) => (
                      <option key={remote.id} value={remote.id}>
                        {remote.displayName}（{remote.remoteName}）
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  绑定顺序
                  <input
                    type="number"
                    min={1}
                    value={binding.priority}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        remoteBindings: prev.remoteBindings.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, priority: Number(e.target.value) } : item
                        )
                      }))
                    }
                  />
                </label>
                <label>
                  远端子目录
                  <input
                    value={binding.remoteBasePath}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        remoteBindings: prev.remoteBindings.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, remoteBasePath: e.target.value } : item
                        )
                      }))
                    }
                    placeholder="例如：team/photos"
                  />
                </label>
                <button
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      remoteBindings: prev.remoteBindings.filter((_, itemIndex) => itemIndex !== index)
                    }))
                  }
                  disabled={form.remoteBindings.length === 1}
                >
                  删除远端
                </button>
              </div>
            ))}
          </section>

          <div className="panel panel--neutral">
            <p className="muted">提示：多个远端需要开启“冗余”或“分片”模式，且两者不能同时启用。</p>
            <p className="muted">绑定顺序说明：单盘模式只取第一个；冗余模式第一个为主盘，其余为备份盘；分片模式仅作为展示顺序。</p>
          </div>
          {submitError ? <p className="error">{submitError}</p> : null}
          {activeMutation.error ? <p className="error">切换映射状态失败。</p> : null}
          {runSyncMutation.error ? <p className="error">手动触发同步失败。</p> : null}
          {runSyncNotice ? <p>{runSyncNotice}</p> : null}
          {deleteMutation.error ? <p className="error">删除映射失败。</p> : null}

          <div className="toggle-row">
            <button onClick={submit} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? '正在保存...' : editingItem ? '保存修改' : '创建映射'}
            </button>
            <button onClick={resetForm}>重置表单</button>
          </div>
        </aside>
      </section>

      <LocalPathPicker
        isOpen={isPathPickerOpen}
        selectedPath={form.localPath}
        onClose={() => setIsPathPickerOpen(false)}
        onSelect={(path) => setForm((prev) => ({ ...prev, localPath: path }))}
      />
    </div>
  );
}
