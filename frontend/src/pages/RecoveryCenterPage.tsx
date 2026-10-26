import { HardDriveDownload, KeyRound, Layers } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '../components/ui';
import { DataRecoveryPage } from './DataRecoveryPage';
import { EncryptionRecoveryPage } from './EncryptionRecoveryPage';
import { RedundancyRecoveryPage } from './RedundancyRecoveryPage';

type RecoveryTab = 'data' | 'redundancy' | 'encryption';

const descriptions: Record<RecoveryTab, string> = {
  data: '把分散在各云盘的文件，按原目录结构恢复到服务器。',
  redundancy: '检查多云冗余映射的副本完整性，补齐失败或缺失的云端副本。',
  encryption: '从加密映射的云端副本中解密并下载单个原始文件。'
};

export function RecoveryCenterPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  const tab: RecoveryTab = raw === 'redundancy' || raw === 'encryption' ? raw : 'data';

  return (
    <div className="page">
      <PageHeader eyebrow="工具" title="恢复中心" description={descriptions[tab]} />
      <Tabs
        value={tab}
        onChange={(next) => setParams({ tab: next }, { replace: true })}
        items={[
          { value: 'data', label: '数据恢复', icon: <HardDriveDownload size={15} /> },
          { value: 'redundancy', label: '副本修复', icon: <Layers size={15} /> },
          { value: 'encryption', label: '加密恢复', icon: <KeyRound size={15} /> }
        ]}
      />
      {tab === 'data' ? <DataRecoveryPage /> : tab === 'redundancy' ? <RedundancyRecoveryPage /> : <EncryptionRecoveryPage />}
    </div>
  );
}
