/**
 * SEARCH INDEXER
 * Full-text search indexing and querying
 */

export interface SearchDocument {
  id: string
  type: string
  title: string
  content: string
  metadata?: Record<string, any>
  tags?: string[]
  createdAt: Date
  updatedAt: Date
}

export interface SearchQuery {
  query: string
  type?: string
  tags?: string[]
  limit?: number
  offset?: number
  sortBy?: 'relevance' | 'date'
}

export interface SearchResult {
  id: string
  type: string
  title: string
  snippet: string
  score: number
  metadata?: Record<string, any>
}

export class SearchIndexer {
  private static index: Map<string, SearchDocument> = new Map()
  private static invertedIndex: Map<string, Set<string>> = new Map()

  /**
   * Index document
   */
  static indexDocument(doc: SearchDocument): void {
    this.index.set(doc.id, doc)
    this.updateInvertedIndex(doc)
  }

  /**
   * Update inverted index
   */
  private static updateInvertedIndex(doc: SearchDocument): void {
    const tokens = this.tokenize(doc.title + ' ' + doc.content)

    for (const token of tokens) {
      if (!this.invertedIndex.has(token)) {
        this.invertedIndex.set(token, new Set())
      }
      this.invertedIndex.get(token)!.add(doc.id)
    }

    // Index tags
    if (doc.tags) {
      for (const tag of doc.tags) {
        const tagToken = `tag:${tag.toLowerCase()}`
        if (!this.invertedIndex.has(tagToken)) {
          this.invertedIndex.set(tagToken, new Set())
        }
        this.invertedIndex.get(tagToken)!.add(doc.id)
      }
    }
  }

  /**
   * Tokenize text
   */
  private static tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2)
  }

  /**
   * Search documents
   */
  static search(query: SearchQuery): SearchResult[] {
    const tokens = this.tokenize(query.query)
    const docScores = new Map<string, number>()

    // Find matching documents
    for (const token of tokens) {
      const docIds = this.invertedIndex.get(token)
      if (!docIds) continue

      for (const docId of docIds) {
        docScores.set(docId, (docScores.get(docId) || 0) + 1)
      }
    }

    // Filter by type
    if (query.type) {
      for (const [docId] of docScores) {
        const doc = this.index.get(docId)
        if (doc && doc.type !== query.type) {
          docScores.delete(docId)
        }
      }
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      for (const [docId] of docScores) {
        const doc = this.index.get(docId)
        if (!doc || !doc.tags) {
          docScores.delete(docId)
          continue
        }

        const hasAllTags = query.tags.every(tag =>
          doc.tags!.includes(tag)
        )

        if (!hasAllTags) {
          docScores.delete(docId)
        }
      }
    }

    // Convert to results
    let results: SearchResult[] = []

    for (const [docId, score] of docScores) {
      const doc = this.index.get(docId)
      if (!doc) continue

      results.push({
        id: doc.id,
        type: doc.type,
        title: doc.title,
        snippet: this.generateSnippet(doc.content, tokens),
        score,
        metadata: doc.metadata,
      })
    }

    // Sort
    if (query.sortBy === 'date') {
      results.sort((a, b) => {
        const docA = this.index.get(a.id)
        const docB = this.index.get(b.id)
        if (!docA || !docB) return 0
        return docB.updatedAt.getTime() - docA.updatedAt.getTime()
      })
    } else {
      results.sort((a, b) => b.score - a.score)
    }

    // Pagination
    const offset = query.offset || 0
    const limit = query.limit || 20
    results = results.slice(offset, offset + limit)

    return results
  }

  /**
   * Generate snippet
   */
  private static generateSnippet(content: string, tokens: string[]): string {
    const maxLength = 200
    const lowerContent = content.toLowerCase()

    // Find first occurrence of any token
    let bestIndex = -1
    for (const token of tokens) {
      const index = lowerContent.indexOf(token)
      if (index !== -1 && (bestIndex === -1 || index < bestIndex)) {
        bestIndex = index
      }
    }

    if (bestIndex === -1) {
      return content.substring(0, maxLength) + '...'
    }

    // Get context around token
    const start = Math.max(0, bestIndex - 50)
    const end = Math.min(content.length, bestIndex + maxLength - 50)
    let snippet = content.substring(start, end)

    if (start > 0) snippet = '...' + snippet
    if (end < content.length) snippet = snippet + '...'

    return snippet
  }

  /**
   * Remove document
   */
  static removeDocument(docId: string): void {
    const doc = this.index.get(docId)
    if (!doc) return

    // Remove from inverted index
    const tokens = this.tokenize(doc.title + ' ' + doc.content)
    for (const token of tokens) {
      const docIds = this.invertedIndex.get(token)
      if (docIds) {
        docIds.delete(docId)
        if (docIds.size === 0) {
          this.invertedIndex.delete(token)
        }
      }
    }

    // Remove from main index
    this.index.delete(docId)
  }

  /**
   * Update document
   */
  static updateDocument(doc: SearchDocument): void {
    this.removeDocument(doc.id)
    this.indexDocument(doc)
  }

  /**
   * Get document
   */
  static getDocument(docId: string): SearchDocument | undefined {
    return this.index.get(docId)
  }

  /**
   * Get statistics
   */
  static getStatistics(): {
    totalDocuments: number
    totalTokens: number
    avgTokensPerDoc: number
    byType: Record<string, number>
  } {
    const byType: Record<string, number> = {}

    for (const doc of this.index.values()) {
      byType[doc.type] = (byType[doc.type] || 0) + 1
    }

    const avgTokensPerDoc = this.index.size > 0
      ? this.invertedIndex.size / this.index.size
      : 0

    return {
      totalDocuments: this.index.size,
      totalTokens: this.invertedIndex.size,
      avgTokensPerDoc,
      byType,
    }
  }

  /**
   * Clear index
   */
  static clear(): void {
    this.index.clear()
    this.invertedIndex.clear()
  }

  /**
   * Bulk index
   */
  static bulkIndex(docs: SearchDocument[]): number {
    let indexed = 0

    for (const doc of docs) {
      try {
        this.indexDocument(doc)
        indexed++
      } catch (error) {
        console.error(`[SearchIndexer] Failed to index ${doc.id}:`, error)
      }
    }

    return indexed
  }

  /**
   * Suggest completions
   */
  static suggest(prefix: string, limit: number = 5): string[] {
    const lowerPrefix = prefix.toLowerCase()
    const suggestions: string[] = []

    for (const token of this.invertedIndex.keys()) {
      if (token.startsWith(lowerPrefix) && !token.startsWith('tag:')) {
        suggestions.push(token)
        if (suggestions.length >= limit) break
      }
    }

    return suggestions
  }

  /**
   * Get related documents
   */
  static getRelated(docId: string, limit: number = 5): SearchResult[] {
    const doc = this.index.get(docId)
    if (!doc) return []

    const tokens = this.tokenize(doc.title + ' ' + doc.content)
    const results = this.search({
      query: tokens.slice(0, 10).join(' '),
      type: doc.type,
      limit: limit + 1,
    })

    return results.filter(r => r.id !== docId).slice(0, limit)
  }
}
