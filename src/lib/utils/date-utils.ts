/**
 * DATE UTILITIES
 * Common date manipulation functions
 */

export class DateUtils {
  /**
   * Format date
   */
  static format(date: Date, format: string = 'YYYY-MM-DD'): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')

    return format
      .replace('YYYY', String(year))
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds)
  }

  /**
   * Add days
   */
  static addDays(date: Date, days: number): Date {
    const result = new Date(date)
    result.setDate(result.getDate() + days)
    return result
  }

  /**
   * Add hours
   */
  static addHours(date: Date, hours: number): Date {
    const result = new Date(date)
    result.setHours(result.getHours() + hours)
    return result
  }

  /**
   * Add minutes
   */
  static addMinutes(date: Date, minutes: number): Date {
    const result = new Date(date)
    result.setMinutes(result.getMinutes() + minutes)
    return result
  }

  /**
   * Difference in days
   */
  static diffDays(date1: Date, date2: Date): number {
    const diff = Math.abs(date1.getTime() - date2.getTime())
    return Math.floor(diff / (1000 * 60 * 60 * 24))
  }

  /**
   * Difference in hours
   */
  static diffHours(date1: Date, date2: Date): number {
    const diff = Math.abs(date1.getTime() - date2.getTime())
    return Math.floor(diff / (1000 * 60 * 60))
  }

  /**
   * Difference in minutes
   */
  static diffMinutes(date1: Date, date2: Date): number {
    const diff = Math.abs(date1.getTime() - date2.getTime())
    return Math.floor(diff / (1000 * 60))
  }

  /**
   * Start of day
   */
  static startOfDay(date: Date): Date {
    const result = new Date(date)
    result.setHours(0, 0, 0, 0)
    return result
  }

  /**
   * End of day
   */
  static endOfDay(date: Date): Date {
    const result = new Date(date)
    result.setHours(23, 59, 59, 999)
    return result
  }

  /**
   * Start of month
   */
  static startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1)
  }

  /**
   * End of month
   */
  static endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999)
  }

  /**
   * Is same day
   */
  static isSameDay(date1: Date, date2: Date): boolean {
    return (
      date1.getFullYear() === date2.getFullYear() &&
      date1.getMonth() === date2.getMonth() &&
      date1.getDate() === date2.getDate()
    )
  }

  /**
   * Is today
   */
  static isToday(date: Date): boolean {
    return this.isSameDay(date, new Date())
  }

  /**
   * Is past
   */
  static isPast(date: Date): boolean {
    return date.getTime() < Date.now()
  }

  /**
   * Is future
   */
  static isFuture(date: Date): boolean {
    return date.getTime() > Date.now()
  }

  /**
   * Is weekend
   */
  static isWeekend(date: Date): boolean {
    const day = date.getDay()
    return day === 0 || day === 6
  }

  /**
   * Get day name
   */
  static getDayName(date: Date): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    return days[date.getDay()]
  }

  /**
   * Get month name
   */
  static getMonthName(date: Date): string {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ]
    return months[date.getMonth()]
  }

  /**
   * Get quarter
   */
  static getQuarter(date: Date): number {
    return Math.floor(date.getMonth() / 3) + 1
  }

  /**
   * Get week number
   */
  static getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  }

  /**
   * Parse ISO string
   */
  static parseISO(str: string): Date {
    return new Date(str)
  }

  /**
   * To ISO string
   */
  static toISO(date: Date): string {
    return date.toISOString()
  }

  /**
   * Relative time
   */
  static relative(date: Date): string {
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (seconds < 60) return 'just now'
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`
    if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
    if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`
    if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`
    return `${Math.floor(days / 365)} year${Math.floor(days / 365) > 1 ? 's' : ''} ago`
  }

  /**
   * Get age
   */
  static getAge(birthDate: Date): number {
    const today = new Date()
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    
    return age
  }

  /**
   * Is leap year
   */
  static isLeapYear(year: number): boolean {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  }

  /**
   * Days in month
   */
  static daysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate()
  }
}
