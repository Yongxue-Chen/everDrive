import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { browseLocalDirectories } from '../lib/api';

type LocalPathPickerProps = {
  isOpen: boolean;
  selectedPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
};

export function LocalPathPicker({ isOpen, selectedPath, onClose, onSelect }: LocalPathPickerProps) {
  const [currentPath, setCurrentPath] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setCurrentPath(selectedPath || undefined);
  }, [isOpen, selectedPath]);

  const query = useQuery({
    queryKey: ['local-path-browser', currentPath],
    queryFn: () => browseLocalDirectories(currentPath),
    enabled: isOpen
  });

  if (!isOpen) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="panel__head">
          <h3>选择服务器目录</h3>
          <button onClick={onClose}>关闭</button>
        </div>

        <p className="mono muted">{query.data?.currentPath ?? currentPath ?? '正在加载根目录...'}</p>

        <div className="toggle-row">
          <button onClick={() => setCurrentPath(undefined)}>返回根目录</button>
          <button onClick={() => setCurrentPath(query.data?.parentPath ?? undefined)} disabled={!query.data?.parentPath}>
            返回上级
          </button>
          <button onClick={() => query.refetch()}>刷新当前目录</button>
        </div>

        {query.isLoading ? <p>正在加载目录...</p> : null}
        {query.error ? <p className="error">加载目录失败。</p> : null}

        <div className="path-list">
          {(query.data?.items ?? []).map((item) => (
            <div className="path-list__item" key={item.path}>
              <div>
                <div>{item.name}</div>
                <div className="mono muted">{item.path}</div>
              </div>
              <div className="panel__actions">
                <button onClick={() => setCurrentPath(item.path)}>进入</button>
                <button
                  onClick={() => {
                    onSelect(item.path);
                    onClose();
                  }}
                >
                  选择
                </button>
              </div>
            </div>
          ))}
        </div>

        {query.data && query.data.items.length === 0 ? <p className="muted">当前目录下没有可选子目录。</p> : null}
      </div>
    </div>
  );
}
