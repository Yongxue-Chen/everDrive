export interface RenameDetector {
  detectRenames(candidateWindowSeconds: number): Promise<void>;
}
