import { Cloud, HardDrive, Network } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { healthTone, roleLabels, strategyLabels, type FlowModel, type TargetRole } from '../lib/mapping-view';
import { middleEllipsis } from './ui';

type Edge = { from: string; to: string; role: TargetRole; path: string };
type Line = Edge & { d: string };

/**
 * All mappings on the left, all clouds on the right, one curve per binding.
 * Answers "which clouds hold which folders" and "what is affected if a cloud fails".
 */
export function TopologyView({ flows }: { flows: FlowModel[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement>());
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [focus, setFocus] = useState<string | null>(null);

  const remotes = useMemo(() => {
    const map = new Map<string, { id: string; name: string; remoteName: string; health: string; count: number }>();
    for (const flow of flows) {
      for (const target of flow.targets) {
        const current = map.get(target.remoteId);
        map.set(target.remoteId, {
          id: target.remoteId,
          name: target.displayName,
          remoteName: target.remoteName,
          health: target.health,
          count: (current?.count ?? 0) + 1
        });
      }
    }
    return [...map.values()];
  }, [flows]);

  const edges = useMemo<Edge[]>(
    () => flows.flatMap((flow) => flow.targets.map((target) => ({ from: `m-${flow.id}`, to: `r-${target.remoteId}`, role: target.role, path: target.path }))),
    [flows]
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const box = container.getBoundingClientRect();
      setSize({ width: box.width, height: box.height });
      setLines(
        edges.flatMap((edge) => {
          const from = nodeRefs.current.get(edge.from)?.getBoundingClientRect();
          const to = nodeRefs.current.get(edge.to)?.getBoundingClientRect();
          if (!from || !to) return [];
          const x1 = from.right - box.left;
          const y1 = from.top + from.height / 2 - box.top;
          const x2 = to.left - box.left;
          const y2 = to.top + to.height / 2 - box.top;
          const bend = Math.max(40, (x2 - x1) / 2);
          return [{ ...edge, d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}` }];
        })
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, [edges]);

  const setNode = (key: string) => (element: HTMLElement | null) => {
    if (element) nodeRefs.current.set(key, element);
    else nodeRefs.current.delete(key);
  };

  const isLit = (edge: Edge) => !focus || edge.from === focus || edge.to === focus;
  const nodeDimmed = (key: string) => Boolean(focus) && focus !== key && !edges.some((edge) => isLit(edge) && (edge.from === key || edge.to === key));

  return (
    <div className="topology" ref={containerRef}>
      <svg className="topology__lines" width={size.width} height={size.height} aria-hidden="true">
        <defs>
          {(['primary', 'backup', 'shard'] as const).map((role) => (
            <marker key={role} id={`arrow-${role}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" className={`topology__arrow role-stroke--${role}`} />
            </marker>
          ))}
        </defs>
        {lines.map((line) => (
          <path
            key={`${line.from}-${line.to}`}
            d={line.d}
            className={`topology__line role-stroke--${line.role} ${isLit(line) ? '' : 'topology__line--dim'}`}
            markerEnd={`url(#arrow-${line.role})`}
          >
            <title>{line.path}</title>
          </path>
        ))}
      </svg>

      <div className="topology__column">
        <div className="topology__heading">来源（{flows.length}）</div>
        {flows.map((flow) => (
          <div
            key={flow.id}
            ref={setNode(`m-${flow.id}`)}
            className={`topology__node ${nodeDimmed(`m-${flow.id}`) ? 'topology__node--dim' : ''}`}
            onMouseEnter={() => setFocus(`m-${flow.id}`)}
            onMouseLeave={() => setFocus(null)}
          >
            <span className="topology__node-icon">{flow.source.kind === 'rclone' ? <Network size={16} /> : <HardDrive size={16} />}</span>
            <span className="topology__node-text">
              <strong>{flow.name}</strong>
              <span className="mono" title={flow.source.path}>
                {middleEllipsis(flow.source.path, 34)}
              </span>
            </span>
            <span className="topology__node-tag">{strategyLabels[flow.strategy]}</span>
          </div>
        ))}
      </div>

      <div className="topology__gutter" />

      <div className="topology__column">
        <div className="topology__heading">云盘（{remotes.length}）</div>
        {remotes.map((remote) => (
          <div
            key={remote.id}
            ref={setNode(`r-${remote.id}`)}
            className={`topology__node topology__node--remote ${nodeDimmed(`r-${remote.id}`) ? 'topology__node--dim' : ''}`}
            onMouseEnter={() => setFocus(`r-${remote.id}`)}
            onMouseLeave={() => setFocus(null)}
          >
            <span className="topology__node-icon">
              <Cloud size={16} />
            </span>
            <span className="topology__node-text">
              <strong>{remote.name}</strong>
              <span className="mono">{remote.remoteName}:</span>
            </span>
            <span className="topology__node-tag">
              <span className={`dot dot--${healthTone(remote.health)}`} />
              {remote.count} 个映射
            </span>
          </div>
        ))}
      </div>

      <div className="topology__legend">
        {(['primary', 'backup', 'shard'] as const).map((role) => (
          <span key={role}>
            <i className={`legend-line role-bg--${role}`} />
            {roleLabels[role]}
          </span>
        ))}
        <span className="muted">悬停节点可高亮相关连线</span>
      </div>
    </div>
  );
}
