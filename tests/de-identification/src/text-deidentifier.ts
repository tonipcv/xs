import * as fs from 'fs';
import { PHIEntity, DeIdentificationResult } from './types';

interface TextValidation {
  isValid: boolean;
  hasStructure: boolean;
  errors: string[];
}

export class TextDeidentifier {
  private phiDetected: PHIEntity[] = [];
  private redactionMap: Map<string, string> = new Map();
  private dateOffset: number;

  constructor() {
    this.dateOffset = Math.floor(Math.random() * 365) + 1;
  }

  async deidentify(textFilePath: string): Promise<DeIdentificationResult> {
    const originalContent = fs.readFileSync(textFilePath, 'utf-8');
    
    this.phiDetected = [];
    this.redactionMap = new Map();
    
    const deidentifiedText = this.processText(originalContent);
    
    const validation = this.validateText(deidentifiedText);
    
    return {
      original: originalContent,
      deidentified: deidentifiedText,
      phiEntities: this.phiDetected,
      redactionMap: this.redactionMap,
      integrityValid: validation.isValid,
      validationDetails: validation
    };
  }

  private processText(text: string): string {
    let result = text;
    
    // Process in order of specificity (most specific first)
    result = this.redactSSN(result);
    result = this.redactMRN(result);
    result = this.redactPhoneNumbers(result);
    result = this.redactEmails(result);
    result = this.redactDates(result);
    result = this.redactAddresses(result);
    result = this.redactNames(result);
    result = this.redactLocations(result);
    
    return result;
  }

  private redactSSN(text: string): string {
    const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/g;
    
    return text.replace(ssnPattern, (match, offset) => {
      this.phiDetected.push({
        type: 'SSN',
        text: match,
        start: offset,
        end: offset + match.length,
        confidence: 1.0
      });
      
      const redacted = 'XXX-XX-XXXX';
      this.redactionMap.set(`SSN_${offset}`, `${match} -> ${redacted}`);
      return redacted;
    });
  }

  private redactMRN(text: string): string {
    const mrnPattern = /\bMRN[:\s-]*([A-Z0-9-]+)\b/gi;
    
    return text.replace(mrnPattern, (match, mrnValue, offset) => {
      this.phiDetected.push({
        type: 'MRN',
        text: match,
        start: offset,
        end: offset + match.length,
        confidence: 0.95
      });
      
      const redacted = 'MRN: REDACTED';
      this.redactionMap.set(`MRN_${offset}`, `${match} -> ${redacted}`);
      return redacted;
    });
  }

  private redactPhoneNumbers(text: string): string {
    const phonePatterns = [
      // US formats
      /\b\d{3}-\d{3}-\d{4}\b/g,
      /\b\(\d{3}\)\s*\d{3}-\d{4}\b/g,
      /\b\d{3}\.\d{3}\.\d{4}\b/g,
      // International formats
      /\+\d{1,3}\s*\(?\d{1,4}\)?\s*[\d\s-]{6,}/g,
      /\+\d{1,3}[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,4}/g,
      // With labels
      /\bPhone:\s*[\d\s()+-]+/gi,
      /\bContact:\s*[\d\s()+-]+/gi,
      /\bTel:\s*[\d\s()+-]+/gi,
      /\bMobile:\s*[\d\s()+-]+/gi
    ];
    
    let result = text;
    
    phonePatterns.forEach(pattern => {
      result = result.replace(pattern, (match, offset) => {
        // Skip if already redacted
        if (match.includes('XXX')) return match;
        
        this.phiDetected.push({
          type: 'PHONE',
          text: match,
          start: offset,
          end: offset + match.length,
          confidence: 0.9
        });
        
        const redacted = match.toLowerCase().includes('phone') || 
                        match.toLowerCase().includes('contact') ||
                        match.toLowerCase().includes('tel') ||
                        match.toLowerCase().includes('mobile')
          ? match.split(/[\d()+-]/)[0] + 'XXX-XXX-XXXX'
          : 'XXX-XXX-XXXX';
        
        this.redactionMap.set(`PHONE_${offset}`, `${match} -> ${redacted}`);
        return redacted;
      });
    });
    
    return result;
  }

  private redactEmails(text: string): string {
    const emailPattern = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    
    return text.replace(emailPattern, (match, offset) => {
      this.phiDetected.push({
        type: 'EMAIL',
        text: match,
        start: offset,
        end: offset + match.length,
        confidence: 1.0
      });
      
      const redacted = 'redacted@example.com';
      this.redactionMap.set(`EMAIL_${offset}`, `${match} -> ${redacted}`);
      return redacted;
    });
  }

  private redactDates(text: string): string {
    const datePatterns = [
      // MM/DD/YYYY
      { pattern: /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12][0-9]|3[01])\/(\d{4})\b/g, format: 'MM/DD/YYYY' },
      // Month DD, YYYY
      { pattern: /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi, format: 'Month DD, YYYY' },
      // DD/MM/YYYY
      { pattern: /\b(0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])\/(\d{4})\b/g, format: 'DD/MM/YYYY' },
      // YYYY-MM-DD
      { pattern: /\b\d{4}-(0?[1-9]|1[0-2])-(0?[1-9]|[12][0-9]|3[01])\b/g, format: 'YYYY-MM-DD' },
      // Date: or DOB: patterns
      { pattern: /\b(Date|DOB|Exam Date|Visit Date|Admission Date|Discharge Date)[:\s]+[^\n]+?\d{4}/gi, format: 'Date field' }
    ];
    
    let result = text;
    
    datePatterns.forEach(({ pattern, format }) => {
      result = result.replace(pattern, (match, ...args) => {
        const offset = args[args.length - 2];
        
        this.phiDetected.push({
          type: 'DATE',
          text: match,
          start: offset,
          end: offset + match.length,
          confidence: 0.85
        });
        
        const redacted = this.shiftDateString(match);
        this.redactionMap.set(`DATE_${offset}`, `${match} -> ${redacted}`);
        return redacted;
      });
    });
    
    return result;
  }

  private redactAddresses(text: string): string {
    const addressPatterns = [
      // Street addresses
      /\b\d+\s+[A-Z][a-z]+\s+(Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct|Place|Pl)(\s+[A-Z]{2}\s+\d{5})?/gi,
      // Address: field
      /\bAddress:\s*[^\n]+/gi,
      // City, State ZIP
      /\b[A-Z][a-z]+,\s*[A-Z]{2}\s+\d{5}(-\d{4})?\b/g
    ];
    
    let result = text;
    
    addressPatterns.forEach(pattern => {
      result = result.replace(pattern, (match, ...args) => {
        const offset = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
        
        this.phiDetected.push({
          type: 'LOCATION',
          text: match,
          start: offset,
          end: offset + match.length,
          confidence: 0.8
        });
        
        const redacted = match.toLowerCase().includes('address') 
          ? 'Address: REDACTED'
          : 'REDACTED';
        
        this.redactionMap.set(`ADDRESS_${offset}`, `${match} -> ${redacted}`);
        return redacted;
      });
    });
    
    return result;
  }

  private redactNames(text: string): string {
    const namePatterns = [
      // Patient: Name pattern (with unicode support)
      /\bPatient:\s+([A-ZÀ-ÿ][a-zà-ÿ]+[\s-]+){1,3}[A-ZÀ-ÿ][a-zà-ÿ]+/g,
      // Dr. Name pattern (with unicode)
      /\bDr\.\s+([A-ZÀ-ÿ][a-zà-ÿ]+[\s-]+){0,2}[A-ZÀ-ÿ][a-zà-ÿ]+/g,
      // Physician: Name pattern
      /\b(Physician|Provider|Doctor|Practitioner|Ordering Physician|Attending Physician):\s+([A-ZÀ-ÿ][a-zà-ÿ]+[\s-]+){0,3}[A-ZÀ-ÿ][a-zà-ÿ]+/gi,
      // Name in format: Last^First^Middle
      /\b[A-ZÀ-ÿ][a-zà-ÿ]+\^[A-ZÀ-ÿ][a-zà-ÿ]+(\^[A-ZÀ-ÿ][a-zà-ÿ]+)?\b/g,
      // Emergency contact patterns
      /\bEmergency contact:\s+([A-ZÀ-ÿ][a-zà-ÿ]+[\s-]+){1,3}[A-ZÀ-ÿ][a-zà-ÿ]+/gi,
      // Signed by patterns
      /\b(Signed by|Dictated by|Transcribed by):\s+([A-ZÀ-ÿ][a-zà-ÿ]+[\s-]+){0,3}[A-ZÀ-ÿ][a-zà-ÿ]+/gi
    ];
    
    let result = text;
    
    namePatterns.forEach(pattern => {
      result = result.replace(pattern, (match, ...args) => {
        const offset = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
        
        // Skip if it's a common medical term
        if (this.isCommonMedicalTerm(match)) {
          return match;
        }
        
        this.phiDetected.push({
          type: 'NAME',
          text: match,
          start: offset,
          end: offset + match.length,
          confidence: 0.75
        });
        
        const redacted = this.generateRedactedName(match);
        this.redactionMap.set(`NAME_${offset}`, `${match} -> ${redacted}`);
        return redacted;
      });
    });
    
    return result;
  }

  private redactLocations(text: string): string {
    const locationPatterns = [
      // Hospital/Clinic names with location
      /\b[A-Z][a-z]+\s+(General\s+)?(Hospital|Medical Center|Clinic|Health Center|Medical Group)/gi,
      // Room numbers
      /\bRoom\s+\d+[A-Z]?\b/gi,
      // Location: field
      /\bLocation:\s*[^\n]+/gi
    ];
    
    let result = text;
    
    locationPatterns.forEach(pattern => {
      result = result.replace(pattern, (match, ...args) => {
        const offset = typeof args[args.length - 2] === 'number' ? args[args.length - 2] : 0;
        
        this.phiDetected.push({
          type: 'LOCATION',
          text: match,
          start: offset,
          end: offset + match.length,
          confidence: 0.7
        });
        
        const redacted = match.toLowerCase().includes('location') 
          ? 'Location: REDACTED'
          : match.toLowerCase().includes('room')
          ? 'Room XXX'
          : 'REDACTED Medical Center';
        
        this.redactionMap.set(`LOCATION_${offset}`, `${match} -> ${redacted}`);
        return redacted;
      });
    });
    
    return result;
  }

  private isCommonMedicalTerm(text: string): boolean {
    const commonTerms = [
      'chest', 'heart', 'lung', 'brain', 'liver', 'kidney',
      'blood', 'bone', 'muscle', 'nerve', 'tissue',
      'normal', 'abnormal', 'acute', 'chronic'
    ];
    
    const lowerText = text.toLowerCase();
    return commonTerms.some(term => lowerText.includes(term));
  }

  private generateRedactedName(original: string): string {
    if (original.toLowerCase().includes('patient')) {
      return 'Patient: ANONYMIZED PATIENT';
    }
    if (original.toLowerCase().includes('dr.')) {
      return 'Dr. REDACTED';
    }
    if (original.toLowerCase().includes('physician') || 
        original.toLowerCase().includes('provider') ||
        original.toLowerCase().includes('doctor')) {
      const prefix = original.split(':')[0];
      return `${prefix}: Dr. REDACTED`;
    }
    if (original.includes('^')) {
      return 'ANONYMIZED^PATIENT';
    }
    
    return 'REDACTED';
  }

  private shiftDateString(dateStr: string): string {
    // Try to parse and shift the date
    try {
      // Handle MM/DD/YYYY format
      const mmddyyyyMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (mmddyyyyMatch) {
        const [_, month, day, year] = mmddyyyyMatch;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        date.setDate(date.getDate() - this.dateOffset);
        
        const newMonth = String(date.getMonth() + 1).padStart(2, '0');
        const newDay = String(date.getDate()).padStart(2, '0');
        const newYear = date.getFullYear();
        
        return dateStr.replace(/\d{1,2}\/\d{1,2}\/\d{4}/, `${newMonth}/${newDay}/${newYear}`);
      }
      
      // Handle Month DD, YYYY format
      const monthNameMatch = dateStr.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i);
      if (monthNameMatch) {
        const [_, monthName, day, year] = monthNameMatch;
        const monthMap: Record<string, number> = {
          'january': 0, 'february': 1, 'march': 2, 'april': 3, 'may': 4, 'june': 5,
          'july': 6, 'august': 7, 'september': 8, 'october': 9, 'november': 10, 'december': 11
        };
        
        const date = new Date(parseInt(year), monthMap[monthName.toLowerCase()], parseInt(day));
        date.setDate(date.getDate() - this.dateOffset);
        
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                       'July', 'August', 'September', 'October', 'November', 'December'];
        const newMonthName = months[date.getMonth()];
        const newDay = date.getDate();
        const newYear = date.getFullYear();
        
        return dateStr.replace(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i, 
                              `${newMonthName} ${newDay}, ${newYear}`);
      }
      
      // Fallback: just shift year if we can find one
      const yearMatch = dateStr.match(/\d{4}/);
      if (yearMatch) {
        const year = parseInt(yearMatch[0]);
        const shiftedYear = year - Math.floor(this.dateOffset / 365) - 1;
        return dateStr.replace(/\d{4}/, shiftedYear.toString());
      }
      
      return '[DATE REDACTED]';
    } catch (e) {
      return '[DATE REDACTED]';
    }
  }

  private validateText(text: string): TextValidation {
    const errors: string[] = [];
    
    // Check if text still has structure
    const hasStructure = text.length > 0 && !text.trim().match(/^(REDACTED\s*)+$/);
    
    if (!hasStructure) {
      errors.push('Text structure lost during de-identification');
    }
    
    // Check for remaining PHI patterns
    const phiPatterns = [
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/, name: 'SSN' },
      { pattern: /\b[a-zA-Z0-9._%+-]+@(?!example\.com|redacted)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/, name: 'Email' },
      { pattern: /\bMRN[:\s-]*(?!REDACTED)[A-Z0-9]{6,}\b/i, name: 'MRN' }
    ];
    
    phiPatterns.forEach(({ pattern, name }) => {
      if (pattern.test(text)) {
        errors.push(`Possible ${name} still present in text`);
      }
    });
    
    // Check that medical content is preserved
    const medicalTerms = ['patient', 'diagnosis', 'treatment', 'exam', 'findings', 'impression'];
    const hasMedicalContent = medicalTerms.some(term => 
      text.toLowerCase().includes(term)
    );
    
    if (!hasMedicalContent && text.length > 100) {
      errors.push('Medical content may have been over-redacted');
    }
    
    return {
      isValid: errors.length === 0,
      hasStructure,
      errors
    };
  }

  getMetrics() {
    return {
      phiDetected: this.phiDetected.length,
      phiRedacted: this.redactionMap.size,
      redactionRate: this.redactionMap.size > 0 ? 
        (this.redactionMap.size / this.phiDetected.length) * 100 : 0
    };
  }
}
