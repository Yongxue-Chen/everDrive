type StatusCardProps = {
  title: string;
  value: string;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
  meta?: string;
};

export function StatusCard({ title, value, tone = 'neutral', meta }: StatusCardProps) {
  return (
    <article className={`status-card status-card--${tone}`}>
      <p className="status-card__title">{title}</p>
      <p className="status-card__value">{value}</p>
      {meta ? <p className="status-card__meta">{meta}</p> : null}
    </article>
  );
}
