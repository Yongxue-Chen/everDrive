import { describe, expect, it, vi } from 'vitest';
import { RcloneSourceService } from '../src/modules/source/rclone-source.service.js';

describe('RcloneSourceService', () => {
  it('only exposes smb and sftp remotes as sources', async () => {
    const client = { listRemotes: vi.fn(async()=>['lan-smb','server-sftp','gdrive']), getRemoteConfig: vi.fn(async(name:string)=>({ type: name==='lan-smb'?'smb':name==='server-sftp'?'sftp':'drive' })) };
    const service = new RcloneSourceService(client as any);
    await expect(service.listSources()).resolves.toEqual([{name:'lan-smb',type:'smb'},{name:'server-sftp',type:'sftp'}]);
  });

  it('normalizes recursive source entries and ignores directories', async () => {
    const client = { getRemoteConfig: vi.fn(async()=>({type:'smb'})), listEntries: vi.fn(async()=>[
      { Path:'photos', Name:'photos', IsDir:true, Size:0, ModTime:'2026-01-01T00:00:00Z', Hashes:{} },
      { Path:'photos/a.jpg', Name:'a.jpg', IsDir:false, Size:12, ModTime:'2026-01-02T00:00:00Z', Hashes:{MD5:'abc'} }
    ]) };
    const service = new RcloneSourceService(client as any);
    await expect(service.scan('lan-smb','')).resolves.toEqual([{relativePath:'photos/a.jpg',sizeBytes:12n,modifiedTime:new Date('2026-01-02T00:00:00Z'),md5:'abc',sha1:null}]);
  });

  it('rejects non-SMB/SFTP source remotes', async () => {
    const service = new RcloneSourceService({getRemoteConfig:vi.fn(async()=>({type:'drive'}))} as any);
    await expect(service.scan('gdrive','')).rejects.toMatchObject({code:'BAD_REQUEST'});
  });
});
