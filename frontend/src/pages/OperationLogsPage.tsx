import { useQuery } from '@tanstack/react-query';
import { RefreshCw, ScrollText, Search } from 'lucide-react';
import { useState } from 'react';
import { errorText } from '../components/feedback';
import { Callout, EmptyState, PageHeader } from '../components/ui';
import { fetchAuditLogs } from '../lib/api';
import { formatDate, formatRelative } from '../lib/format';

const operationLabels: Record<string, string> = {
  create: '创建',
  update: '更新',
  delete: '删除',
  sync: '同步',
  rename: '重命名',
  migrate: '迁移',
  verify: '校验'
};

const targetLabels: Record<string, string> = {
  mapping_task: '映射',
  remote: '云盘',
  file: '文件',
  file_location: '云端副本',
  sync_job: '同步任务'
};

const operationTones: Record<string, string> = { delete: 'bad', sync: 'brand', create: 'good', migrate: 'warn' };

export function OperationLogsPage() {
  const [operationType, setOperation] = useState('');
  const [targetType, setTarget] = useState('');
  const [keyword, setKeyword] = useState('');
  const logs = useQuery({
    queryKey: ['audit', operationType, targetType],
    queryFn: () => fetchAuditLogs({ operationType: operationType || undefined, targetType: targetType || undefined, limit: 200 }),
    refetchInterval: 30000
  });
  const items = (logs.data?.items ?? []).filter((item) => !keyword.trim() || item.message.toLowerCase().includes(keyword.trim().toLowerCase()));

  return (
    <div className="page">
      <PageHeader
        title="活动记录"
        description="everDrive 执行过的同步、修改和删除操作。"
        actions={
          <button className="icon-button" aria-label="刷新" title="刷新" onClick={() => void logs.refetch()}>
            <RefreshCw size={16} />
          </button>
        }
      />
      <div className="toolbar">
        <label className="search-input">
          <Search size={16} />
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索描述" />
        </label>
        <select className="toolbar__select" value={operationType} onChange={(event) => setOperation(event.target.value)} aria-label="操作类型">
          <option value="">全部操作</option>
          {Object.entries(operationLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select className="toolbar__select" value={targetType} onChange={(event) => setTarget(event.target.value)} aria-label="对象类型">
          <option value="">全部对象</option>
          {Object.entries(targetLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {logs.error ? <Callout tone="bad">{errorText(logs.error, '加载活动记录失败。')}</Callout> : null}
      <section className="panel panel--flush">
        {logs.data && items.length === 0 ? <EmptyState icon={<ScrollText size={26} />} title="没有匹配的记录" /> : null}
        <ul className="log-list">
          {items.map((item) => (
            <li key={item.id} className="log-item">
              <span className={`log-item__op badge badge--${operationTones[item.operationType] ?? 'neutral'}`}>
                {operationLabels[item.operationType] ?? item.operationType}
              </span>
              <div className="log-item__body">
                <div className="log-item__line">
                  <strong>{targetLabels[item.targetType] ?? item.targetType}</strong>
                  {item.targetId ? <span className="mono muted">#{item.targetId}</span> : null}
                  <span>{item.message}</span>
                </div>
                {item.metadataJson ? (
                  <details>
                    <summary>查看详情</summary>
                    <pre className="code-block">{JSON.stringify(item.metadataJson, null, 2)}</pre>
                  </details>
                ) : null}
              </div>
              <time className="log-item__time muted" title={formatDate(item.createdAt)}>
                {formatRelative(item.createdAt)}
              </time>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
