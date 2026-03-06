/**
 * Evaluation Dataset Splitter
 * Splits datasets into train/test/val sets with optional stratification
 */

export interface SplitConfig {
  train: number;
  test: number;
  val?: number;
  stratify_by?: string;
  seed?: number;
}

export interface SplitResult {
  train: any[];
  test: any[];
  val?: any[];
}

export class EvalSplitter {
  /**
   * Split dataset into train/test/val sets
   */
  split(records: any[], config: SplitConfig): SplitResult {
    this.validateConfig(config);

    const seed = config.seed ?? 42;
    const shuffled = this.shuffle([...records], seed);

    if (config.stratify_by) {
      return this.stratifiedSplit(shuffled, config);
    }

    return this.randomSplit(shuffled, config);
  }

  /**
   * Validate split configuration
   */
  private validateConfig(config: SplitConfig): void {
    if (config.train <= 0 || config.test <= 0) {
      throw new Error('Train and test splits must be positive');
    }

    if (config.val !== undefined && config.val < 0) {
      throw new Error('Val split must be non-negative');
    }

    const total = config.train + config.test + (config.val ?? 0);
    if (Math.abs(total - 1.0) > 0.001) {
      throw new Error(`Split ratios must sum to 1.0, got ${total}`);
    }
  }

  /**
   * Random split without stratification
   */
  private randomSplit(records: any[], config: SplitConfig): SplitResult {
    const n = records.length;
    
    if (n === 0) {
      return { train: [], test: [], val: config.val ? [] : undefined };
    }

    const trainSize = Math.max(1, Math.floor(n * config.train));
    const testSize = Math.max(config.val ? 0 : 1, Math.floor(n * config.test));
    const valSize = config.val ? Math.max(0, n - trainSize - testSize) : 0;

    const train = records.slice(0, trainSize);
    const test = records.slice(trainSize, trainSize + testSize);
    const val = config.val ? records.slice(trainSize + testSize, trainSize + testSize + valSize) : undefined;

    return { train, test, val };
  }

  /**
   * Stratified split by label
   */
  private stratifiedSplit(records: any[], config: SplitConfig): SplitResult {
    const stratifyBy = config.stratify_by!;
    
    const groups = new Map<any, any[]>();
    for (const record of records) {
      const label = record[stratifyBy];
      if (!groups.has(label)) {
        groups.set(label, []);
      }
      groups.get(label)!.push(record);
    }

    const train: any[] = [];
    const test: any[] = [];
    const val: any[] = [];

    for (const [label, groupRecords] of groups) {
      const split = this.randomSplit(groupRecords, config);
      train.push(...split.train);
      test.push(...split.test);
      if (split.val) {
        val.push(...split.val);
      }
    }

    return {
      train,
      test,
      val: config.val ? val : undefined,
    };
  }

  /**
   * Shuffle array with seed for reproducibility
   */
  private shuffle(array: any[], seed: number): any[] {
    let currentSeed = seed;
    
    const random = () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };

    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }

    return array;
  }

  /**
   * Get split statistics
   */
  getStatistics(split: SplitResult): {
    train: { count: number; percentage: number };
    test: { count: number; percentage: number };
    val?: { count: number; percentage: number };
    total: number;
  } {
    const total = split.train.length + split.test.length + (split.val?.length ?? 0);

    return {
      train: {
        count: split.train.length,
        percentage: (split.train.length / total) * 100,
      },
      test: {
        count: split.test.length,
        percentage: (split.test.length / total) * 100,
      },
      val: split.val
        ? {
            count: split.val.length,
            percentage: (split.val.length / total) * 100,
          }
        : undefined,
      total,
    };
  }
}
