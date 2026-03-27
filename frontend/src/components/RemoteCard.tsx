import { formatBytes } from '../lib/format';

type RemoteCardProps = {
  name: string;
  healthStatus: string;
  usagePercent: number;
  usedCapacity: string;
  remainingCapacity: string;
  warningFlag: boolean;
};

export function RemoteCard(props: RemoteCardProps) {
  const tone = props.warningFlag ? 'warn' : 'good';
  return (
    <article className={`remote-card remote-card--${tone} ${props.warningFlag ? 'remote-card--pulse' : ''}`}>
      <header className="remote-card__header">
        <h4>{props.name}</h4>
        <span className={`badge badge--${props.healthStatus}`}>{props.healthStatus}</span>
      </header>
      <p className="remote-card__usage">{props.usagePercent.toFixed(2)}%</p>
      <div className="progress">
        <div className="progress__bar" style={{ width: `${Math.min(100, props.usagePercent)}%` }} />
      </div>
      <p className="remote-card__meta">
        Used {formatBytes(props.usedCapacity)} / Remaining {formatBytes(props.remainingCapacity)}
      </p>
    </article>
  );
}
