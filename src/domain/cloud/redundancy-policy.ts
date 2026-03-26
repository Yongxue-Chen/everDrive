export interface RedundancyPolicy {
  replicas: number;
  pickTargets(objectKey: string): Promise<string[]>;
}
