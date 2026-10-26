import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createRcloneRemote,
  deleteRcloneRemote,
  getRcloneRemote,
  listRcloneConfigRemotes,
  listRcloneProviders,
  runRcloneConfigFlow,
  testRcloneRemote,
  updateRcloneRemote,
  updateRcloneRemoteWebUrl
} from '../lib/api';
import type { RcloneConfigValue, RcloneProvider, RcloneProviderOption } from '../lib/types';
import { Plus, RefreshCw } from 'lucide-react';
import { useFeedback } from '../components/feedback';
import { Callout, PageHeader } from '../components/ui';

const COMMON_PROVIDER_ORDER = ['smb', 'sftp', 'drive', 'onedrive', 'dropbox', 'webdav', 's3'];
const MAX_PROVIDER_LABEL_LENGTH = 72;
const REMOTE_STATUS_REFRESH_MS = 10 * 60 * 1000;
type ConnectionStatus = { state: 'unknown' | 'checking' | 'online' | 'offline'; checkedAt?: string; error?: string };

function providerOrder(provider: RcloneProvider): number {
  const index = COMMON_PROVIDER_ORDER.indexOf(provider.Prefix);
  return index === -1 ? COMMON_PROVIDER_ORDER.length : index;
}

function providerLabel(provider: RcloneProvider): string {
  const description = provider.Description.trim();
  const shortDescription = description.length > MAX_PROVIDER_LABEL_LENGTH ? description.slice(0, MAX_PROVIDER_LABEL_LENGTH - 3) + '...' : description;
  return shortDescription + ' (' + provider.Prefix + ')';
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function RcloneConfigPage() {
  const queryClient = useQueryClient();
  const { confirm, toast } = useFeedback();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [parameters, setParameters] = useState<Record<string, RcloneConfigValue>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [revealedFields, setRevealedFields] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState('');
  const [editError, setEditError] = useState('');
  const [linkRemoteName, setLinkRemoteName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [flowState, setFlowState] = useState('');
  const [flowResult, setFlowResult] = useState('');
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({});
  const remotes = useQuery({ queryKey: ['rclone-config-remotes'], queryFn: listRcloneConfigRemotes });
  const providers = useQuery({ queryKey: ['rclone-providers'], queryFn: listRcloneProviders, staleTime: 300000 });
  const provider = useMemo(() => providers.data?.providers.find((item) => item.Prefix === type || item.Name === type), [providers.data, type]);
  const visibleProviders = useMemo(
    () =>
      (providers.data?.providers ?? [])
        .filter((item) => !item.Hide)
        .sort((left, right) => providerOrder(left) - providerOrder(right) || left.Description.localeCompare(right.Description)),
    [providers.data]
  );
  const options = (provider?.Options ?? []).filter((option) => !option.Advanced || showAdvanced).filter((option) => option.Hide !== 3);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['rclone-config-remotes'] });
    await queryClient.invalidateQueries({ queryKey: ['rclone-remote-options'] });
  };
  const reset = () => {
    setEditingName(null);
    setName('');
    setType('');
    setParameters({});
    setRevealedFields(new Set());
    setMessage('');
    setEditError('');
  };
  const save = useMutation({
    mutationFn: async () => (editingName ? updateRcloneRemote(editingName, parameters) : createRcloneRemote({ name, type, parameters })),
    onMutate: () => {
      setMessage('');
      setEditError('');
    },
    onSuccess: async () => {
      await refresh();
      toast('success', `已保存 ${name}:`);
      setEditingName(null);
      setName('');
      setType('');
      setParameters({});
      setMessage('');
    }
  });
  const remove = useMutation({
    mutationFn: deleteRcloneRemote,
    onMutate: () => setMessage(''),
    onSuccess: async (_, removed) => {
      await refresh();
      toast('success', `已删除 ${removed}:`);
    }
  });
  const saveLink = useMutation({
    mutationFn: () => updateRcloneRemoteWebUrl(linkRemoteName, linkUrl || null),
    onSuccess: async () => {
      await refresh();
      setLinkRemoteName('');
      setLinkUrl('');
    }
  });
  const configFlow = useMutation({
    mutationFn: () =>
      runRcloneConfigFlow({
        action: editingName ? 'update' : 'create',
        name,
        type: type || undefined,
        parameters,
        state: flowState || undefined,
        result: flowResult || undefined
      }),
    onSuccess: async (response) => {
      const state = typeof response.item.State === 'string' ? response.item.State : '';
      setFlowState(state);
      if (!state) await refresh();
    }
  });

  const runConnectionTest = useCallback(async (remoteName: string) => {
    setConnectionStatuses((current) => ({ ...current, [remoteName]: { state: 'checking' } }));
    try {
      const result = await testRcloneRemote(remoteName);
      setConnectionStatuses((current) => ({
        ...current,
        [remoteName]: { state: result.online ? 'online' : 'offline', checkedAt: new Date().toISOString(), error: result.error }
      }));
    } catch (error) {
      setConnectionStatuses((current) => ({
        ...current,
        [remoteName]: { state: 'offline', checkedAt: new Date().toISOString(), error: errorMessage(error, '连接测试失败。') }
      }));
    }
  }, []);
  const remoteNamesKey = (remotes.data?.items ?? []).map((remote) => remote.name).join('\n');
  useEffect(() => {
    const remoteNames = remoteNamesKey ? remoteNamesKey.split('\n') : [];
    if (!remoteNames.length) return;
    const testAll = () => {
      for (const remoteName of remoteNames) void runConnectionTest(remoteName);
    };
    testAll();
    const timer = window.setInterval(testAll, REMOTE_STATUS_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [remoteNamesKey, runConnectionTest]);

  const beginEdit = async (remoteName: string) => {
    setEditError('');
    try {
      const response = await getRcloneRemote(remoteName);
      setEditingName(remoteName);
      setName(remoteName);
      setType(response.item.type);
      setParameters(response.item.parameters as Record<string, RcloneConfigValue>);
      setMessage('敏感字段留空表示保持原值。');
    } catch (error) {
      setEditError(errorMessage(error, '读取 rclone 配置失败。'));
    }
  };
  const setValue = (option: RcloneProviderOption, raw: string | boolean) => {
    const value: RcloneConfigValue = option.Type === 'bool' ? Boolean(raw) : raw;
    setParameters((current) => ({ ...current, [option.Name]: value }));
  };
  const operationError = save.error ?? remove.error ?? remotes.error ?? providers.error;
  const renderConnectionStatus = (remoteName: string) => {
    const status = connectionStatuses[remoteName] ?? { state: 'unknown' as const };
    const label = status.state === 'online' ? '连接正常' : status.state === 'offline' ? '连接异常' : status.state === 'checking' ? '检测中' : '未检测';
    return (
      <div className="remote-status">
        <span className={`connection-status-dot connection-status-dot--${status.state}`} />
        <span>{label}</span>
      </div>
    );
  };
  const renderConnectionDetails = (remoteName: string) => {
    const status = connectionStatuses[remoteName];
    if (!status) return null;
    return (
      <>
        {status.error ? <p className="error remote-connection-error">{status.error}</p> : null}
        {status.checkedAt ? <p className="muted remote-checked-at">最后检测：{new Date(status.checkedAt).toLocaleString()}</p> : null}
      </>
    );
  };
  const isConnectionChecking = (remoteName: string) => connectionStatuses[remoteName]?.state === 'checking';
  const renderOptionInput = (option: RcloneProviderOption) => {
    if (option.Type === 'bool')
      return <input type="checkbox" checked={Boolean(parameters[option.Name])} onChange={(e) => setValue(option, e.target.checked)} />;
    if (option.Examples?.length)
      return (
        <select value={String(parameters[option.Name] ?? '')} onChange={(e) => setValue(option, e.target.value)}>
          <option value="">默认值</option>
          {option.Examples.map((example) => (
            <option key={example.Value} value={example.Value}>
              {example.Value || '默认'}
            </option>
          ))}
        </select>
      );
    const sensitive = Boolean(option.IsPassword || option.Sensitive);
    return (
      <div className="secret-input">
        <input
          type={sensitive && !revealedFields.has(option.Name) ? 'password' : 'text'}
          value={String(parameters[option.Name] ?? '')}
          placeholder={option.DefaultStr ?? ''}
          onChange={(e) => setValue(option, e.target.value)}
        />
        {sensitive ? (
          <button
            type="button"
            onClick={() =>
              setRevealedFields((current) => {
                const next = new Set(current);
                next.has(option.Name) ? next.delete(option.Name) : next.add(option.Name);
                return next;
              })
            }
          >
            {revealedFields.has(option.Name) ? '隐藏敏感内容' : '显示敏感内容'}
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <div className="page">
      <PageHeader
        title="连接"
        description="管理底层 rclone remote：云盘账号、NAS 的 SMB/SFTP 连接等。仅提供受控配置操作，不开放任意命令行。"
        actions={
          <>
            <button className="icon-button" aria-label="刷新" title="刷新" onClick={() => void refresh()}>
              <RefreshCw size={16} />
            </button>
            <button
              className="button-primary"
              onClick={() => {
                reset();
                document.getElementById('rclone-editor')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Plus size={16} />
              新增 remote
            </button>
          </>
        }
      />
      <Callout tone="info" title="需要 OAuth 授权的云盘">
        需要浏览器交互授权的云盘，请在服务器上运行 <span className="mono">docker compose exec rclone rclone config</span>，完成后刷新本页。
      </Callout>
      <section className="cards-grid">
        {(remotes.data?.items ?? []).map((remote) => (
          <article className="panel rclone-card" key={remote.name}>
            <div className="panel__head">
              <h3 className="mono">{remote.name}:</h3>
              <div className="remote-status-group">
                {renderConnectionStatus(remote.name)}
                <span className={`badge badge--${remote.boundDisplayName ? 'brand' : 'neutral'}`}>
                  {remote.boundDisplayName ? `云盘：${remote.boundDisplayName}` : '未用作云盘'}
                </span>
              </div>
            </div>
            {renderConnectionDetails(remote.name)}
            <div className="panel__actions remote-actions">
              {remote.webUrl ? (
                <a className="button-link" href={remote.webUrl} target="_blank" rel="noreferrer">
                  打开网站
                </a>
              ) : null}
              <button
                onClick={() => {
                  setLinkRemoteName(remote.name);
                  setLinkUrl(remote.webUrl ?? '');
                }}
              >
                编辑链接
              </button>
              <button onClick={() => void beginEdit(remote.name)}>编辑</button>
              <button disabled={isConnectionChecking(remote.name)} onClick={() => void runConnectionTest(remote.name)}>
                {isConnectionChecking(remote.name) ? '测试中...' : '测试连接'}
              </button>
              <button
                disabled={Boolean(remote.boundRemoteId) || remove.isPending}
                onClick={() => {
                  void confirm({
                    title: `删除 rclone remote「${remote.name}」？`,
                    description: '只删除 rclone 中的连接配置，不会删除云盘上的文件。',
                    confirmLabel: '删除',
                    danger: true
                  }).then((ok) => {
                    if (ok) remove.mutate(remote.name);
                  });
                }}
              >
                删除
              </button>
            </div>
          </article>
        ))}
      </section>
      {linkRemoteName ? (
        <section className="panel">
          <div className="panel__head">
            <h3>编辑 {linkRemoteName}: 的访问链接</h3>
            <button onClick={() => setLinkRemoteName('')}>取消</button>
          </div>
          <div className="settings-grid">
            <label>
              网盘网站或设备管理页面
              <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://..." />
            </label>
          </div>
          <button className="button-primary" onClick={() => saveLink.mutate()} disabled={saveLink.isPending}>
            保存链接
          </button>
        </section>
      ) : null}
      <details className="panel advanced-panel">
        <summary>
          <h3>高级 rclone 配置向导</h3>
        </summary>
        <p className="muted">仅调用 rclone 官方 config/create 或 config/update 状态流，不开放容器 Shell。适用于 OAuth 和复杂 provider。</p>
        <p className="muted">通过 Tailscale 访问其他设备时，可将 SMB/SFTP host 填为目标设备的 100.x.x.x 地址。</p>
        <div className="settings-grid">
          <label>
            向导状态
            <input value={flowState} onChange={(e) => setFlowState(e.target.value)} placeholder="首次运行留空" />
          </label>
          <label>
            本步回答
            <input value={flowResult} onChange={(e) => setFlowResult(e.target.value)} />
          </label>
        </div>
        <button disabled={!name || (!editingName && !type) || configFlow.isPending} onClick={() => configFlow.mutate()}>
          {flowState ? '继续向导' : '启动高级配置向导'}
        </button>
        {configFlow.data ? <pre className="config-flow-output">{JSON.stringify(configFlow.data.item, null, 2)}</pre> : null}
        {configFlow.error ? <p className="error">{errorMessage(configFlow.error, '高级配置向导失败。')}</p> : null}
      </details>
      <section className="panel" id="rclone-editor">
        <div className="panel__head">
          <h3>{editingName ? `编辑 ${editingName}:` : '新增 rclone remote'}</h3>
          {editingName ? <button onClick={reset}>取消</button> : null}
        </div>
        <div className="settings-grid">
          <label>
            Remote 名称
            <input disabled={Boolean(editingName)} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            存储类型
            <select
              disabled={Boolean(editingName)}
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setParameters({});
              }}
            >
              <option value="">请选择 provider</option>
              {visibleProviders.map((item) => (
                <option key={item.Prefix} value={item.Prefix}>
                  {providerLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {provider ? (
          <>
            <p className="muted">{provider.Description}</p>
            <div className="settings-grid">
              {options.map((option) => (
                <label key={option.Name}>
                  {option.Name}
                  {option.Required ? ' *' : ''}
                  {renderOptionInput(option)}
                  <small className="muted">{option.Help?.split('\n')[0]}</small>
                </label>
              ))}
            </div>
            <button onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? '隐藏高级选项' : '显示高级选项'}</button>
          </>
        ) : null}
        {message ? <p>{message}</p> : null}
        {editError ? <p className="error">{editError}</p> : null}
        {operationError ? <p className="error">{errorMessage(operationError, 'rclone 配置操作失败。')}</p> : null}
        <div className="inline-actions">
          <button className="button-primary" disabled={!name || !type || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? '保存中...' : '保存配置'}
          </button>
        </div>
      </section>
    </div>
  );
}
