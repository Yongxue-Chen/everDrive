import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { createRcloneRemote, deleteRcloneRemote, getRcloneRemote, listRcloneConfigRemotes, listRcloneProviders, testRcloneRemote, updateRcloneRemote } from '../lib/api';
import type { RcloneConfigValue, RcloneProviderOption } from '../lib/types';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function RcloneConfigPage() {
  const queryClient = useQueryClient();
  const [editingName, setEditingName] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [parameters, setParameters] = useState<Record<string, RcloneConfigValue>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [message, setMessage] = useState('');
  const [editError, setEditError] = useState('');
  const remotes = useQuery({ queryKey: ['rclone-config-remotes'], queryFn: listRcloneConfigRemotes });
  const providers = useQuery({ queryKey: ['rclone-providers'], queryFn: listRcloneProviders, staleTime: 300000 });
  const provider = useMemo(() => providers.data?.providers.find((item) => item.Prefix === type || item.Name === type), [providers.data, type]);
  const options = (provider?.Options ?? []).filter((option) => !option.Advanced || showAdvanced).filter((option) => option.Hide !== 3);

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['rclone-config-remotes'] });
    await queryClient.invalidateQueries({ queryKey: ['rclone-remote-options'] });
  };
  const reset = () => { setEditingName(null); setName(''); setType(''); setParameters({}); setMessage(''); setEditError(''); };
  const save = useMutation({
    mutationFn: async () => editingName ? updateRcloneRemote(editingName, parameters) : createRcloneRemote({ name, type, parameters }),
    onMutate: () => { setMessage(''); setEditError(''); },
    onSuccess: async () => { await refresh(); setEditingName(null); setName(''); setType(''); setParameters({}); setMessage('配置已保存。'); }
  });
  const remove = useMutation({ mutationFn: deleteRcloneRemote, onMutate: () => setMessage(''), onSuccess: async () => { await refresh(); setMessage('配置已删除。'); } });
  const test = useMutation({ mutationFn: testRcloneRemote, onMutate: () => setMessage(''), onSuccess: () => setMessage('连接测试成功。') });

  const beginEdit = async (remoteName: string) => {
    setEditError('');
    try {
      const response = await getRcloneRemote(remoteName);
      setEditingName(remoteName); setName(remoteName); setType(response.item.type);
      setParameters(response.item.parameters as Record<string, RcloneConfigValue>); setMessage('敏感字段留空表示保持原值。');
    } catch (error) {
      setEditError(errorMessage(error, '读取 rclone 配置失败。'));
    }
  };
  const setValue = (option: RcloneProviderOption, raw: string | boolean) => {
    const value: RcloneConfigValue = option.Type === 'bool' ? Boolean(raw) : raw;
    setParameters((current) => ({ ...current, [option.Name]: value }));
  };
  const operationError = save.error ?? remove.error ?? test.error ?? remotes.error ?? providers.error;

  return <div className="page">
    <header className="page__header"><div><h1>rclone 配置中心</h1><p className="muted">仅提供受控配置操作，不开放任意命令行。</p></div><button onClick={() => void refresh()}>刷新</button></header>
    <section className="panel panel--warning"><strong>OAuth 提示</strong><p className="muted">需要浏览器交互授权的云盘，请在容器控制台运行 <span className="mono">docker compose exec rclone rclone config</span>，完成后刷新本页。</p></section>
    <section className="cards-grid">
      {(remotes.data?.items ?? []).map((remote) => <article className="panel" key={remote.name}>
        <div className="panel__head"><h3 className="mono">{remote.name}:</h3><span className="badge">{remote.boundDisplayName ? `已绑定：${remote.boundDisplayName}` : '未绑定'}</span></div>
        <div className="panel__actions remote-actions"><button onClick={() => void beginEdit(remote.name)}>编辑</button><button onClick={() => test.mutate(remote.name)}>测试连接</button><button disabled={Boolean(remote.boundRemoteId) || remove.isPending} onClick={() => { if (window.confirm(`删除 rclone remote “${remote.name}”吗？`)) remove.mutate(remote.name); }}>删除</button></div>
      </article>)}
    </section>
    <section className="panel"><div className="panel__head"><h3>{editingName ? `编辑 ${editingName}:` : '新增 rclone remote'}</h3>{editingName ? <button onClick={reset}>取消</button> : null}</div>
      <div className="settings-grid"><label>Remote 名称<input disabled={Boolean(editingName)} value={name} onChange={(e) => setName(e.target.value)} /></label><label>存储类型<select disabled={Boolean(editingName)} value={type} onChange={(e) => { setType(e.target.value); setParameters({}); }}><option value="">请选择 provider</option>{(providers.data?.providers ?? []).filter((item) => !item.Hide).map((item) => <option key={item.Prefix} value={item.Prefix}>{item.Description} ({item.Prefix})</option>)}</select></label></div>
      {provider ? <><p className="muted">{provider.Description}</p><div className="settings-grid">{options.map((option) => <label key={option.Name}>{option.Name}{option.Required ? ' *' : ''}{option.Type === 'bool' ? <input type="checkbox" checked={Boolean(parameters[option.Name])} onChange={(e) => setValue(option, e.target.checked)} /> : option.Examples?.length ? <select value={String(parameters[option.Name] ?? '')} onChange={(e) => setValue(option, e.target.value)}><option value="">默认值</option>{option.Examples.map((example) => <option key={example.Value} value={example.Value}>{example.Value || '默认'}</option>)}</select> : <input type={option.IsPassword || option.Sensitive ? 'password' : 'text'} value={String(parameters[option.Name] ?? '')} placeholder={option.DefaultStr ?? ''} onChange={(e) => setValue(option, e.target.value)} />}<small className="muted">{option.Help?.split('\n')[0]}</small></label>)}</div><button onClick={() => setShowAdvanced((value) => !value)}>{showAdvanced ? '隐藏高级选项' : '显示高级选项'}</button></> : null}
      {message ? <p>{message}</p> : null}{editError ? <p className="error">{editError}</p> : null}{operationError ? <p className="error">{errorMessage(operationError, 'rclone 配置操作失败。')}</p> : null}<div className="toggle-row"><button disabled={!name || !type || save.isPending} onClick={() => save.mutate()}>{save.isPending ? '保存中...' : '保存配置'}</button></div>
    </section>
  </div>;
}
