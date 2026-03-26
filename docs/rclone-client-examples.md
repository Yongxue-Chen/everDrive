# Rclone Client / Service Usage Examples

```ts
import { rcloneClient } from '../src/infrastructure/rclone/rclone-rcd-client.js';
import { RcloneService } from '../src/infrastructure/rclone/rclone.service.js';

const rcloneService = new RcloneService(rcloneClient);
```

## 1. 检查 rcd 是否在线

```ts
const online = await rcloneClient.checkOnline();
console.log({ online });
```

## 2. 列出 remotes / 配置信息

```ts
const remotes = await rcloneClient.listRemotes();
const providers = await rcloneClient.getConfigProviders();
```

## 3. copy

```ts
await rcloneClient.copy({
  srcFs: '/data/source',
  srcRemote: '',
  dstFs: 'driveA:',
  dstRemote: 'backup'
});
```

## 4. sync

```ts
await rcloneClient.sync({
  srcFs: '/data/source',
  srcRemote: '',
  dstFs: 'driveA:',
  dstRemote: 'mirror'
});
```

## 5. move

```ts
await rcloneClient.move({
  srcFs: '/data/source',
  srcRemote: 'old-name',
  dstFs: '/data/source',
  dstRemote: 'new-name'
});
```

## 6. delete / purge

```ts
await rcloneClient.deleteFile({
  fs: 'driveA:',
  remote: 'backup/file.txt'
});

await rcloneClient.purge({
  fs: 'driveA:',
  remote: 'backup/old-dir'
});
```

## 7. mkdir

```ts
await rcloneClient.mkdir({
  fs: 'driveA:',
  remote: 'backup/new-dir'
});
```

## 8. remote 到 remote copy

```ts
await rcloneService.remoteToRemoteCopy({
  sourceRemote: 'driveA:',
  sourcePath: 'photos',
  targetRemote: 'driveB:',
  targetPath: 'archive/photos'
});
```

## 9. 异步任务状态查询

```ts
const op = await rcloneClient.copy({
  srcFs: '/data/source',
  srcRemote: '',
  dstFs: 'driveA:',
  dstRemote: 'big-copy',
  async: true
});

if (op.async) {
  const status = await rcloneService.waitForJob(op.jobId, {
    intervalMs: 1000,
    timeoutMs: 10 * 60 * 1000
  });
  console.log(status);
}
```

## 异常处理示例

```ts
import { RcloneClientError } from '../src/infrastructure/rclone/rclone-rcd-client.js';

try {
  await rcloneClient.copy({
    srcFs: 'missingRemote:',
    srcRemote: '',
    dstFs: 'driveA:',
    dstRemote: 'x'
  });
} catch (error) {
  if (error instanceof RcloneClientError) {
    switch (error.code) {
      case 'REMOTE_NOT_FOUND':
        // remote 不存在
        break;
      case 'AUTH_FAILED':
        // 认证失败
        break;
      case 'NETWORK_TIMEOUT':
        // 网络超时
        break;
      case 'PATH_CONFLICT':
        // 目标路径冲突
        break;
      default:
        // 其它 rclone API 错误
        break;
    }
  }
}
```
