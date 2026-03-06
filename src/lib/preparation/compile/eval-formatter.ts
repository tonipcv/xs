/**
 * Evaluation Formatter
 * Formats records into standard evaluation format:
 * {"input": "...", "expected_output": "...", "label": "...", "metadata": {...}}
 */

export interface EvalRecord {
  input: string;
  expected_output: string;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface EvalFormatConfig {
  input_field?: string;
  output_field?: string;
  label_field?: string;
  metadata_fields?: string[];
  include_metadata?: boolean;
}

export class EvalFormatter {
  format(records: Array<Record<string, unknown>>, config: EvalFormatConfig = {}): EvalRecord[] {
    const inputField = config.input_field ?? 'input';
    const outputField = config.output_field ?? 'expected_output';
    const labelField = config.label_field ?? 'label';
    const includeMetadata = config.include_metadata ?? true;
    const metadataFields = config.metadata_fields;

    return records.map((record) => {
      const input = this.extractString(record, inputField);
      const expectedOutput = this.extractString(record, outputField);
      const label = this.extractString(record, labelField);

      let metadata: Record<string, unknown> | undefined;
      if (includeMetadata) {
        metadata = this.extractMetadata(record, metadataFields, [inputField, outputField, labelField]);
      }

      return {
        input,
        expected_output: expectedOutput,
        ...(label && { label }),
        ...(metadata && Object.keys(metadata).length > 0 && { metadata }),
      };
    }).filter((record) => this.isValid(record));
  }

  private extractString(record: Record<string, unknown>, field: string): string {
    const value = record[field];
    if (typeof value === 'string') {
      return value;
    }
    if (value !== null && value !== undefined) {
      return String(value);
    }
    return '';
  }

  private extractMetadata(
    record: Record<string, unknown>,
    metadataFields?: string[],
    excludeFields: string[] = []
  ): Record<string, unknown> {
    if (metadataFields && metadataFields.length > 0) {
      const metadata: Record<string, unknown> = {};
      for (const field of metadataFields) {
        if (field in record) {
          metadata[field] = record[field];
        }
      }
      return metadata;
    }

    // Include all fields except excluded ones
    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (!excludeFields.includes(key)) {
        metadata[key] = value;
      }
    }
    return metadata;
  }

  private isValid(record: EvalRecord): boolean {
    return record.input.trim().length > 0 && record.expected_output.trim().length > 0;
  }

  validate(records: EvalRecord[]): { valid: EvalRecord[]; invalid: number; errors: string[] } {
    const valid: EvalRecord[] = [];
    let invalid = 0;
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (!record.input || record.input.trim().length === 0) {
        invalid++;
        errors.push(`Record ${i}: missing or empty input`);
        continue;
      }
      if (!record.expected_output || record.expected_output.trim().length === 0) {
        invalid++;
        errors.push(`Record ${i}: missing or empty expected_output`);
        continue;
      }
      valid.push(record);
    }

    return { valid, invalid, errors };
  }
}
