export interface MigrationPlanner {
  planMigration(sourceRemoteId: string, targetRemoteId: string): Promise<string>;
}
