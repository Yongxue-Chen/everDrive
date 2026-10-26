import { ArrowRight, Cloud, HardDrive, Lock, Network, Trash2 } from 'lucide-react';
import { formatBytes } from '../lib/format';
import { healthLabels, healthTone, roleLabels, strategyFlowHints, strategyLabels, type FlowModel } from '../lib/mapping-view';
import { PathText } from './ui';

function SourceIcon({ kind, size = 18 }: { kind: FlowModel['source']['kind']; size?: number }) {
  return kind === 'rclone' ? <Network size={size} /> : <HardDrive size={size} />;
}

/**
 * Visualises "what is backed up where": the source on the left, one branch per
 * target cloud on the right, with the strategy and sync mode on the connector.
 */
export function MappingFlow({ flow, compact = false }: { flow: FlowModel; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flow-compact">
        <span className="flow-compact__source" title={`${flow.source.title} ${flow.source.path}`}>
          <SourceIcon kind={flow.source.kind} size={14} />
          <span className="mono">{flow.source.short}</span>
        </span>
        <ArrowRight size={14} className="flow-compact__arrow" />
        {flow.targets.length ? (
          flow.targets.map((target) => (
            <span key={target.remoteId} className={`flow-compact__target role--${target.role}`} title={target.path}>
              <span className={`dot dot--${healthTone(target.health)}`} />
              {target.displayName}
              {flow.targets.length > 1 ? <small>{roleLabels[target.role]}</small> : null}
            </span>
          ))
        ) : (
          <span className="flow-compact__target flow-compact__target--empty">尚未绑定云盘</span>
        )}
      </div>
    );
  }

  const mirror = flow.syncMode === 'mirror';
  return (
    <div className={`flow flow--${flow.strategy}`}>
      <div className="flow__source">
        <div className="flow__node-label">
          <SourceIcon kind={flow.source.kind} size={16} />
          {flow.source.kind === 'rclone' ? '局域网来源（只读）' : '来源'}
        </div>
        <div className="flow__node-title">{flow.source.title}</div>
        <PathText value={flow.source.path} max={44} />
      </div>

      <div className={`flow__connector ${mirror ? 'flow__connector--mirror' : ''}`}>
        <span className="flow__connector-label">
          {strategyLabels[flow.strategy]}
          {flow.encrypted ? <Lock size={12} aria-label="已加密" /> : null}
        </span>
        <span className="flow__line" aria-hidden="true" />
        <span className="flow__connector-hint">
          {mirror ? (
            <>
              <Trash2 size={12} /> 镜像：会同步删除
            </>
          ) : (
            strategyFlowHints[flow.strategy]
          )}
        </span>
      </div>

      <ul className={`flow__targets ${flow.targets.length === 1 ? 'flow__targets--single' : ''}`}>
        {flow.targets.length ? (
          flow.targets.map((target, index) => (
            <li key={target.remoteId} className="flow-target">
              <div className={`flow-target__card role--${target.role}`}>
                <div className="flow-target__head">
                  <span className={`role-badge role-badge--${target.role}`}>
                    {roleLabels[target.role]}
                    {target.role === 'shard' ? ` ${index + 1}` : ''}
                  </span>
                  <span className="flow-target__name">
                    <Cloud size={14} />
                    {target.displayName}
                  </span>
                  <span className={`health health--${healthTone(target.health)}`}>
                    <span className={`dot dot--${healthTone(target.health)}`} />
                    {healthLabels[target.health] ?? target.health}
                  </span>
                </div>
                <PathText value={target.path} max={48} />
                {target.availableBytes ? <div className="flow-target__meta">剩余可用 {formatBytes(target.availableBytes)}</div> : null}
              </div>
            </li>
          ))
        ) : (
          <li className="flow-target">
            <div className="flow-target__card flow-target__card--empty">尚未绑定云盘</div>
          </li>
        )}
      </ul>
    </div>
  );
}
