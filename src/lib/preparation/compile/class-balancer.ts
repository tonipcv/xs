/**
 * Class Balancer for Evaluation Datasets
 * Balances classes by undersampling majority or oversampling minority
 */

export interface ClassBalanceConfig {
  strategy: 'undersample' | 'oversample' | 'none';
  target_ratio?: number; // Target ratio between majority and minority (e.g., 1.5 = 1.5:1)
  seed?: number;
}

export interface BalancedSplit<T> {
  train: T[];
  test: T[];
  val?: T[];
  balanceStats: {
    originalDistribution: Record<string, number>;
    balancedDistribution: Record<string, number>;
    strategy: string;
    recordsRemoved: number;
    recordsAdded: number;
  };
}

export class ClassBalancer {
  balance<T extends { label?: string }>(
    split: { train: T[]; test: T[]; val?: T[] },
    config: ClassBalanceConfig
  ): BalancedSplit<T> {
    if (config.strategy === 'none') {
      const distribution = this.getDistribution(split.train);
      return {
        ...split,
        balanceStats: {
          originalDistribution: distribution,
          balancedDistribution: distribution,
          strategy: 'none',
          recordsRemoved: 0,
          recordsAdded: 0,
        },
      };
    }

    const originalDistribution = this.getDistribution(split.train);
    
    if (config.strategy === 'undersample') {
      const balancedTrain = this.undersample(split.train, config.target_ratio ?? 1.0, config.seed ?? 42);
      const balancedDistribution = this.getDistribution(balancedTrain);
      
      return {
        train: balancedTrain,
        test: split.test,
        val: split.val,
        balanceStats: {
          originalDistribution,
          balancedDistribution,
          strategy: 'undersample',
          recordsRemoved: split.train.length - balancedTrain.length,
          recordsAdded: 0,
        },
      };
    }

    if (config.strategy === 'oversample') {
      const balancedTrain = this.oversample(split.train, config.target_ratio ?? 1.0, config.seed ?? 42);
      const balancedDistribution = this.getDistribution(balancedTrain);
      
      return {
        train: balancedTrain,
        test: split.test,
        val: split.val,
        balanceStats: {
          originalDistribution,
          balancedDistribution,
          strategy: 'oversample',
          recordsRemoved: 0,
          recordsAdded: balancedTrain.length - split.train.length,
        },
      };
    }

    throw new Error(`Unknown balance strategy: ${config.strategy}`);
  }

  private getDistribution<T extends { label?: string }>(records: T[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    for (const record of records) {
      const label = record.label ?? 'unknown';
      distribution[label] = (distribution[label] ?? 0) + 1;
    }
    return distribution;
  }

  private undersample<T extends { label?: string }>(
    records: T[],
    targetRatio: number,
    seed: number
  ): T[] {
    const byLabel = this.groupByLabel(records);
    const labels = Object.keys(byLabel);
    
    if (labels.length < 2) return records;

    const counts = labels.map(l => byLabel[l].length);
    const minCount = Math.min(...counts);
    const targetCount = Math.floor(minCount * targetRatio);

    const rng = this.mulberry32(seed);
    const balanced: T[] = [];

    for (const label of labels) {
      const labelRecords = byLabel[label];
      
      if (labelRecords.length <= targetCount) {
        balanced.push(...labelRecords);
      } else {
        // Shuffle and take targetCount
        const shuffled = this.shuffle(labelRecords, rng());
        balanced.push(...shuffled.slice(0, targetCount));
      }
    }

    // Final shuffle to mix labels
    return this.shuffle(balanced, rng());
  }

  private oversample<T extends { label?: string }>(
    records: T[],
    targetRatio: number,
    seed: number
  ): T[] {
    const byLabel = this.groupByLabel(records);
    const labels = Object.keys(byLabel);
    
    if (labels.length < 2) return records;

    const counts = labels.map(l => byLabel[l].length);
    const maxCount = Math.max(...counts);
    const targetCount = Math.floor(maxCount / targetRatio);

    const rng = this.mulberry32(seed);
    const balanced: T[] = [];

    for (const label of labels) {
      const labelRecords = byLabel[label];
      
      if (labelRecords.length >= targetCount) {
        balanced.push(...labelRecords);
      } else {
        // Duplicate records to reach target
        const needed = targetCount - labelRecords.length;
        const shuffled = this.shuffle(labelRecords, rng());
        
        balanced.push(...labelRecords);
        
        // Add duplicates with suffix to mark them
        for (let i = 0; i < needed; i++) {
          const original = shuffled[i % shuffled.length];
          balanced.push({
            ...original,
            // Add metadata to indicate synthetic sample
            metadata: {
              ...((original as any).metadata ?? {}),
              _synthetic: true,
              _original_index: i % shuffled.length,
            },
          } as T);
        }
      }
    }

    // Final shuffle to mix labels
    return this.shuffle(balanced, rng());
  }

  private groupByLabel<T extends { label?: string }>(records: T[]): Record<string, T[]> {
    const groups: Record<string, T[]> = {};
    for (const record of records) {
      const label = record.label ?? 'unknown';
      if (!groups[label]) groups[label] = [];
      groups[label].push(record);
    }
    return groups;
  }

  private shuffle<T>(array: T[], seed: number): T[] {
    const result = [...array];
    const rng = this.mulberry32(seed);
    
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    
    return result;
  }

  private mulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), t | 1);
      r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  getImbalanceRatio(distribution: Record<string, number>): number {
    const counts = Object.values(distribution);
    if (counts.length < 2) return 1;
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    return max / min;
  }

  isBalanced(distribution: Record<string, number>, threshold = 1.5): boolean {
    return this.getImbalanceRatio(distribution) <= threshold;
  }
}
