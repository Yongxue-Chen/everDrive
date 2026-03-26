export interface FileScanner {
  scan(basePath: string): Promise<AsyncIterable<string>>;
}
