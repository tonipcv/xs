/**
 * PII De-identifier with Multiple Masking Strategies
 * HIPAA-compliant text de-identification
 */

export interface PIIEntity {
  type: 'name' | 'ssn' | 'mrn' | 'phone' | 'email' | 'address' | 'dob' | 'date' | 'id';
  value: string;
  start: number;
  end: number;
  confidence: number;
}

export interface DeidentificationConfig {
  strategy: 'mask' | 'redact' | 'hash' | 'tokenize' | 'synthetic';
  preserveFormat?: boolean;
  maskChar?: string;
  tenantId?: string;
  entityTypes?: PIIEntity['type'][];
}

export interface DeidentificationResult {
  text: string;
  entities: PIIEntity[];
  maskedCount: number;
  strategy: string;
  report: {
    namesRemoved: number;
    datesRemoved: number;
    idsRemoved: number;
    contactRemoved: number;
  };
}

export class PIIDeidentifier {
  // Regex patterns for common PII
  private patterns: Record<PIIEntity['type'], RegExp> = {
    name: /\b(?:Dr\.|Mr\.|Mrs\.|Ms\.)?\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
    ssn: /\b\d{3}[-.]?\d{2}[-.]?\d{4}\b/g,
    mrn: /\b(?:MRN|Medical Record|Patient ID)[\s:#-]*(\d{6,10})\b/gi,
    phone: /\b(?:\+?1[-.]?)?\s*\(?\d{3}\)?[-.]?\s*\d{3}[-.]?\d{4}\b/g,
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    address: /\b\d+\s+[A-Za-z0-9\s,]+(?:Apt|Suite|Unit)?\s*\d+?[\s,]*[A-Za-z]+,?\s*[A-Za-z]{2}\s*\d{5}(-\d{4})?\b/g,
    dob: /\b(?:DOB|Date of Birth|Birth Date)[:\s]*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/gi,
    date: /\b(?:0?[1-9]|1[0-2])[/-](?:0?[1-9]|[12]\d|3[01])[/-](?:19|20)\d{2}\b/g,
    id: /\b(?:ID|Identifier)[\s:#-]*(\w{6,})\b/gi,
  };

  deidentify(text: string, config: DeidentificationConfig): DeidentificationResult {
    const entities = this.detectPII(text, config.entityTypes);
    const strategy = config.strategy;
    let maskedText = text;
    let maskedCount = 0;

    // Sort by position (descending) to avoid offset issues when replacing
    const sortedEntities = [...entities].sort((a, b) => b.start - a.start);

    for (const entity of sortedEntities) {
      const replacement = this.getReplacement(entity, strategy, config);
      maskedText = maskedText.substring(0, entity.start) + replacement + maskedText.substring(entity.end);
      maskedCount++;
    }

    return {
      text: maskedText,
      entities,
      maskedCount,
      strategy,
      report: this.generateReport(entities),
    };
  }

  private detectPII(text: string, entityTypes?: PIIEntity['type'][]): PIIEntity[] {
    const entities: PIIEntity[] = [];
    const typesToCheck = entityTypes ?? Object.keys(this.patterns) as PIIEntity['type'][];

    for (const type of typesToCheck) {
      const pattern = this.patterns[type];
      let match;
      while ((match = pattern.exec(text)) !== null) {
        entities.push({
          type,
          value: match[0],
          start: match.index,
          end: match.index + match[0].length,
          confidence: this.calculateConfidence(type, match[0]),
        });
      }
      pattern.lastIndex = 0; // Reset for next scan
    }

    // Remove overlapping entities (keep higher confidence)
    return this.removeOverlapping(entities);
  }

  private removeOverlapping(entities: PIIEntity[]): PIIEntity[] {
    const sorted = entities.sort((a, b) => a.start - b.start || b.confidence - a.confidence);
    const result: PIIEntity[] = [];

    for (const entity of sorted) {
      const overlaps = result.some(
        (e) => (entity.start < e.end && entity.end > e.start)
      );
      if (!overlaps) {
        result.push(entity);
      }
    }

    return result;
  }

  private calculateConfidence(type: PIIEntity['type'], value: string): number {
    switch (type) {
      case 'ssn':
        return /^\d{3}[-.]?\d{2}[-.]?\d{4}$/.test(value) ? 0.95 : 0.7;
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? 0.9 : 0.6;
      case 'phone':
        return value.length >= 10 ? 0.85 : 0.6;
      case 'mrn':
        return /\d{6,10}/.test(value) ? 0.8 : 0.5;
      default:
        return 0.7;
    }
  }

  private getReplacement(entity: PIIEntity, strategy: string, config: DeidentificationConfig): string {
    const maskChar = config.maskChar ?? '*';
    const length = entity.value.length;

    switch (strategy) {
      case 'mask':
        if (config.preserveFormat) {
          return entity.value.replace(/[^\s]/g, maskChar);
        }
        return maskChar.repeat(length);
      case 'redact':
        return `[${entity.type.toUpperCase()}]`;
      case 'hash':
        return this.simpleHash(entity.value);
      case 'tokenize':
        return `<${entity.type.toUpperCase()}_${this.simpleHash(entity.value).substring(0, 8)}>`;
      case 'synthetic':
        return this.generateSynthetic(entity.type, length);
      default:
        return maskChar.repeat(length);
    }
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  private generateSynthetic(type: PIIEntity['type'], length: number): string {
    switch (type) {
      case 'ssn':
        return `XXX-XX-${Math.floor(1000 + Math.random() * 9000)}`;
      case 'phone':
        return `(XXX) XXX-${Math.floor(1000 + Math.random() * 9000)}`;
      case 'email':
        return `redacted@example.com`;
      case 'name':
        return '[NAME]';
      default:
        return 'X'.repeat(Math.min(length, 10));
    }
  }

  private generateReport(entities: PIIEntity[]): DeidentificationResult['report'] {
    const report = {
      namesRemoved: 0,
      datesRemoved: 0,
      idsRemoved: 0,
      contactRemoved: 0,
    };

    for (const entity of entities) {
      switch (entity.type) {
        case 'name':
          report.namesRemoved++;
          break;
        case 'dob':
        case 'date':
          report.datesRemoved++;
          break;
        case 'ssn':
        case 'mrn':
        case 'id':
          report.idsRemoved++;
          break;
        case 'phone':
        case 'email':
        case 'address':
          report.contactRemoved++;
          break;
      }
    }

    return report;
  }

  // Validation methods
  validateDeidentification(original: string, result: DeidentificationResult): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check that PII entities were actually removed
    for (const entity of result.entities) {
      if (result.text.includes(entity.value)) {
        issues.push(`PII not removed: ${entity.type} at position ${entity.start}`);
      }
    }

    // Check for length consistency
    if (result.strategy === 'mask' && result.text.length !== original.length) {
      issues.push('Masked text length differs from original');
    }

    return { valid: issues.length === 0, issues };
  }

  // Batch processing
  async batchDeidentify(
    texts: string[],
    config: DeidentificationConfig,
    onProgress?: (processed: number, total: number) => void
  ): Promise<DeidentificationResult[]> {
    const results: DeidentificationResult[] = [];

    for (let i = 0; i < texts.length; i++) {
      results.push(this.deidentify(texts[i], config));
      onProgress?.(i + 1, texts.length);
    }

    return results;
  }
}
