import type { PrismaClient } from '@prisma/client';

export class RcloneRemoteMetadataRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(): Promise<Array<{ remoteName: string; webUrl: string | null }>> {
    return this.prisma.rcloneRemoteMetadata.findMany({
      select: { remoteName: true, webUrl: true }
    });
  }

  async setWebUrl(remoteName: string, webUrl: string | null): Promise<void> {
    await this.prisma.rcloneRemoteMetadata.upsert({
      where: { remoteName },
      create: { remoteName, webUrl },
      update: { webUrl }
    });
  }

  async delete(remoteName: string): Promise<void> {
    await this.prisma.rcloneRemoteMetadata.deleteMany({ where: { remoteName } });
  }
}
