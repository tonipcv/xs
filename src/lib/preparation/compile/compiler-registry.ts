import { TaskType, Modality, Runtime, PreparationConfig } from '../preparation.types';
import { PretrainJsonlCompiler } from './targets/pretrain-jsonl';
import { PretrainMegatronCompiler } from './targets/pretrain-megatron';
import { PretrainMdsCompiler } from './targets/pretrain-mds';
import { SftJsonlCompiler } from './targets/sft-jsonl';
import { DpoJsonlCompiler } from './targets/dpo-jsonl';
import { RagCorpusCompiler } from './targets/rag-corpus';
import { EvalDatasetCompiler } from './targets/eval-dataset';
import { VisionWdsCompiler } from './targets/vision-wds';
import { AudioWdsCompiler } from './targets/audio-wds';
import { MultimodalWdsCompiler } from './targets/multimodal-wds';

export interface CompileResult {
  shardCount: number;
  totalSizeBytes: number;
  outputPaths: string[];
}

export interface Compiler {
  compile(datasetId: string, config: PreparationConfig): Promise<CompileResult>;
}

export class CompilerRegistry {
  private compilers: Map<string, Compiler>;

  constructor() {
    this.compilers = new Map();
    this.registerCompilers();
  }

  private registerCompilers(): void {
    this.compilers.set('pre-training:text:hf', new PretrainJsonlCompiler());
    this.compilers.set('pre-training:text:megatron', new PretrainMegatronCompiler());
    this.compilers.set('pre-training:text:mosaic', new PretrainMdsCompiler());
    this.compilers.set('fine-tuning:text:hf', new SftJsonlCompiler());
    this.compilers.set('fine-tuning:text:openai', new SftJsonlCompiler());
    this.compilers.set('dpo:text:trl', new DpoJsonlCompiler());
    this.compilers.set('rag:text:generic', new RagCorpusCompiler());
    this.compilers.set('eval:text:generic', new EvalDatasetCompiler());
    this.compilers.set('eval:image:generic', new EvalDatasetCompiler());
    this.compilers.set('eval:audio:generic', new EvalDatasetCompiler());
    this.compilers.set('pre-training:image:pytorch', new VisionWdsCompiler());
    this.compilers.set('fine-tuning:image:pytorch', new VisionWdsCompiler());
    this.compilers.set('pre-training:audio:pytorch', new AudioWdsCompiler());
    this.compilers.set('fine-tuning:audio:hf', new AudioWdsCompiler());
    this.compilers.set('pre-training:multimodal:pytorch', new MultimodalWdsCompiler());
  }

  getCompiler(task: TaskType, modality: Modality, runtime: Runtime): Compiler {
    const key = `${task}:${modality}:${runtime}`;
    const compiler = this.compilers.get(key);

    if (!compiler) {
      throw new Error(`No compiler registered for ${key}`);
    }

    return compiler;
  }

  registerCompiler(task: TaskType, modality: Modality, runtime: Runtime, compiler: Compiler): void {
    const key = `${task}:${modality}:${runtime}`;
    this.compilers.set(key, compiler);
  }
}
