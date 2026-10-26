/**
 * Isolated store for practice-mode writes (doc 09 §2C). Nothing here is visible to normal
 * screens or searches, and it is cleared when a practice session ends.
 */
export interface TrainingRecord {
  id: string;
  kind: 'lead';
  createdAt: string;
  data: Record<string, unknown>;
}

export class TrainingStore {
  private records: TrainingRecord[] = [];
  private counter = 0;

  add(kind: TrainingRecord['kind'], data: Record<string, unknown>): TrainingRecord {
    const record: TrainingRecord = {
      id: `trn_${++this.counter}`,
      kind,
      createdAt: new Date().toISOString(),
      data,
    };
    this.records.push(record);
    return record;
  }

  list(): readonly TrainingRecord[] {
    return this.records;
  }

  clear(): void {
    this.records = [];
  }
}
