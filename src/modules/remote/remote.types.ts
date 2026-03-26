export type RemoteProvider = 's3' | 'b2' | 'gdrive' | 'onedrive' | 'dropbox' | 'webdav' | 'custom';

export type RemoteConfig = {
  id: string;
  provider: RemoteProvider;
  displayName: string;
  rcloneRemoteName: string;
  encrypted: boolean;
};

export type SyncView = {
  localPath: string;
  remotePath: string;
  localState: 'synced' | 'pending' | 'missing' | 'conflicted';
  remoteState: 'synced' | 'pending' | 'missing' | 'conflicted';
};
