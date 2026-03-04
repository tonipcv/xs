/**
 * STRING UTILITIES
 * Common string manipulation functions
 */

export class StringUtils {
  /**
   * Truncate string
   */
  static truncate(str: string, length: number, suffix: string = '...'): string {
    if (str.length <= length) return str
    return str.substring(0, length - suffix.length) + suffix
  }

  /**
   * Capitalize first letter
   */
  static capitalize(str: string): string {
    if (!str) return str
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
  }

  /**
   * Title case
   */
  static titleCase(str: string): string {
    return str
      .split(' ')
      .map(word => this.capitalize(word))
      .join(' ')
  }

  /**
   * Slugify string
   */
  static slugify(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
  }

  /**
   * Generate random string
   */
  static random(length: number = 10, charset: string = 'alphanumeric'): string {
    const charsets = {
      alphanumeric: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
      alpha: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
      numeric: '0123456789',
      hex: '0123456789abcdef',
    }

    const chars = charsets[charset as keyof typeof charsets] || charset
    let result = ''

    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    return result
  }

  /**
   * Mask string
   */
  static mask(str: string, visibleChars: number = 4, maskChar: string = '*'): string {
    if (str.length <= visibleChars) return str
    const visible = str.slice(-visibleChars)
    const masked = maskChar.repeat(str.length - visibleChars)
    return masked + visible
  }

  /**
   * Count words
   */
  static wordCount(str: string): number {
    return str.trim().split(/\s+/).filter(Boolean).length
  }

  /**
   * Reverse string
   */
  static reverse(str: string): string {
    return str.split('').reverse().join('')
  }

  /**
   * Check if palindrome
   */
  static isPalindrome(str: string): boolean {
    const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '')
    return cleaned === this.reverse(cleaned)
  }

  /**
   * Remove HTML tags
   */
  static stripHtml(str: string): string {
    return str.replace(/<[^>]*>/g, '')
  }

  /**
   * Escape HTML
   */
  static escapeHtml(str: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;',
    }

    return str.replace(/[&<>"'/]/g, char => map[char])
  }

  /**
   * Unescape HTML
   */
  static unescapeHtml(str: string): string {
    const map: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#x27;': "'",
      '&#x2F;': '/',
    }

    return str.replace(/&amp;|&lt;|&gt;|&quot;|&#x27;|&#x2F;/g, entity => map[entity])
  }

  /**
   * Pad string
   */
  static pad(str: string, length: number, char: string = ' ', side: 'left' | 'right' | 'both' = 'right'): string {
    if (str.length >= length) return str

    const padding = char.repeat(length - str.length)

    switch (side) {
      case 'left':
        return padding + str
      case 'right':
        return str + padding
      case 'both':
        const leftPad = Math.floor(padding.length / 2)
        const rightPad = padding.length - leftPad
        return char.repeat(leftPad) + str + char.repeat(rightPad)
    }
  }

  /**
   * Extract numbers from string
   */
  static extractNumbers(str: string): number[] {
    const matches = str.match(/\d+/g)
    return matches ? matches.map(Number) : []
  }

  /**
   * Count occurrences
   */
  static count(str: string, substring: string): number {
    return (str.match(new RegExp(substring, 'g')) || []).length
  }

  /**
   * Replace all
   */
  static replaceAll(str: string, search: string, replace: string): string {
    return str.split(search).join(replace)
  }

  /**
   * Insert at position
   */
  static insert(str: string, index: number, insertion: string): string {
    return str.slice(0, index) + insertion + str.slice(index)
  }

  /**
   * Remove at position
   */
  static remove(str: string, start: number, length: number): string {
    return str.slice(0, start) + str.slice(start + length)
  }

  /**
   * Levenshtein distance
   */
  static levenshtein(a: string, b: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1]
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        }
      }
    }

    return matrix[b.length][a.length]
  }

  /**
   * Similarity percentage
   */
  static similarity(a: string, b: string): number {
    const distance = this.levenshtein(a, b)
    const maxLength = Math.max(a.length, b.length)
    return maxLength === 0 ? 100 : ((maxLength - distance) / maxLength) * 100
  }
}
