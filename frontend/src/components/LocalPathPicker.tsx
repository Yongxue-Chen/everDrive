import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CornerLeftUp, Folder, Home, RefreshCw, X } from 'lucide-react';
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
        <div className="modal__head">
          <h3>选择服务器目录</h3>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <p className="picker__current mono">{query.data?.currentPath ?? currentPath ?? '正在加载根目录...'}</p>

        <div className="inline-actions">
          <button onClick={() => setCurrentPath(undefined)}>
            <Home size={15} />
            根目录
          </button>
          <button onClick={() => setCurrentPath(query.data?.parentPath ?? undefined)} disabled={!query.data?.parentPath}>
            <CornerLeftUp size={15} />
            上级
          </button>
          <button onClick={() => query.refetch()}>
            <RefreshCw size={15} />
            刷新
          </button>
          <button
            className="button-primary picker__pick"
            disabled={!query.data?.currentPath}
            onClick={() => {
              onSelect(query.data!.currentPath);
              onClose();
            }}
          >
            选择当前目录
          </button>
        </div>

        {query.isLoading ? <p>正在加载目录...</p> : null}
        {query.error ? <p className="error">加载目录失败。</p> : null}

        <div className="path-list">
          {(query.data?.items ?? []).map((item) => (
            <div className="path-list__item" key={item.path}>
              <button className="path-list__enter" onClick={() => setCurrentPath(item.path)} title="打开">
                <Folder size={18} />
                <span>
                  <span>{item.name}</span>
                  <span className="mono muted">{item.path}</span>
                </span>
                <ChevronRight size={16} />
              </button>
              <div className="inline-actions">
                <button
                  className="button-sm"
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
