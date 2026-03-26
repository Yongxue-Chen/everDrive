export interface FileHasher {
  hash(filePath: string): Promise<string>;
}
