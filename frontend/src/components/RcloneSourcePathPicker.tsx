import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { browseRcloneSource } from '../lib/api';

type RcloneSourcePathPickerProps = {
  isOpen: boolean;
  remoteName: string;
  selectedPath: string;
  onClose: () => void;
  onSelect: (path: string) => void;
};

export function RcloneSourcePathPicker({ isOpen, remoteName, selectedPath, onClose, onSelect }: RcloneSourcePathPickerProps) {
  const [currentPath, setCurrentPath] = useState<string>('');

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setCurrentPath(selectedPath || '');
  }, [isOpen, selectedPath]);

  const query = useQuery({
    queryKey: ['rclone-source-browser', remoteName, currentPath],
    queryFn: () => browseRcloneSource(remoteName, currentPath),
    enabled: isOpen && Boolean(remoteName)
  });

  if (!isOpen) {
    return null;
  }

  const getParentPath = (path: string): string | null => {
    if (!path) return null;
    const parts = path.split('/');
    parts.pop();
    return parts.join('/');
  };

  const parentPath = getParentPath(currentPath);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="panel__head">
          <h3>选择来源目录 (SMB/SFTP: {remoteName})</h3>
          <button onClick={onClose}>关闭</button>
        </div>

        <p className="mono muted">/{currentPath || ''}</p>

        <div className="toggle-row">
          <button onClick={() => setCurrentPath('')}>返回根目录</button>
          <button onClick={() => setCurrentPath(parentPath ?? '')} disabled={parentPath === null}>
            返回上级
          </button>
          <button onClick={() => query.refetch()}>刷新当前目录</button>
        </div>

        {query.isLoading ? <p>正在加载目录...</p> : null}
        {query.error ? <p className="error">加载目录失败。</p> : null}

        <div className="path-list">
          {(query.data?.items ?? []).filter((item) => item.isDirectory).map((item) => (
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

        {query.data && query.data.items.filter((item) => item.isDirectory).length === 0 ? <p className="muted">当前目录下没有可选子目录。</p> : null}
      </div>
    </div>
  );
}
