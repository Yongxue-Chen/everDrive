import { formatGigabytes } from '../lib/format';

type RemoteCardProps = {
  name: string;
  healthStatus: string;
  usagePercent: number;
  usedCapacity: string;
  remainingCapacity: string;
  warningFlag: boolean;
  usageKnown?: boolean;
};

export function RemoteCard(props: RemoteCardProps) {
  const tone = props.warningFlag ? 'warn' : 'good';
  const healthLabel =
    props.healthStatus === 'healthy'
      ? '健康'
      : props.healthStatus === 'warning'
        ? '告警'
        : props.healthStatus === 'full'
          ? '已满'
          : props.healthStatus === 'unavailable'
            ? '不可用'
            : props.healthStatus;
  return (
    <article className={`remote-card remote-card--${tone} ${props.warningFlag ? 'remote-card--pulse' : ''}`}>
      <header className="remote-card__header">
        <h4>{props.name}</h4>
        <span className={`badge badge--${props.healthStatus}`}>{healthLabel}</span>
      </header>
      <p className="remote-card__usage">{props.usagePercent.toFixed(2)}%</p>
      <div className="progress">
        <div className="progress__bar" style={{ width: `${Math.min(100, props.usagePercent)}%` }} />
      </div>
      <p className="remote-card__meta">
        已用 {props.usageKnown === false ? '不可读取' : formatGigabytes(props.usedCapacity)} / 剩余 {formatGigabytes(props.remainingCapacity)}
      </p>
    </article>
  );
}
