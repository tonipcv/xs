/**
 * Search Indexer Tests
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { SearchIndexer } from '@/lib/search/search-indexer'

describe('Search Indexer', () => {
  beforeEach(() => {
    SearchIndexer.clear()
  })

  describe('indexDocument', () => {
    it('should index document', () => {
      const doc = {
        id: '1',
        type: 'article',
        title: 'Test Article',
        content: 'This is a test article about search indexing',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      SearchIndexer.indexDocument(doc)
      const retrieved = SearchIndexer.getDocument('1')
      
      expect(retrieved).toBeDefined()
      expect(retrieved?.title).toBe('Test Article')
    })
  })

  describe('search', () => {
    beforeEach(() => {
      SearchIndexer.indexDocument({
        id: '1',
        type: 'article',
        title: 'JavaScript Tutorial',
        content: 'Learn JavaScript programming basics',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      SearchIndexer.indexDocument({
        id: '2',
        type: 'article',
        title: 'Python Guide',
        content: 'Python programming for beginners',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    })

    it('should search documents', () => {
      const results = SearchIndexer.search({ query: 'JavaScript' })
      
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('1')
    })

    it('should filter by type', () => {
      const results = SearchIndexer.search({
        query: 'programming',
        type: 'article',
      })
      
      expect(results.length).toBe(2)
    })

    it('should limit results', () => {
      const results = SearchIndexer.search({
        query: 'programming',
        limit: 1,
      })
      
      expect(results.length).toBe(1)
    })
  })

  describe('removeDocument', () => {
    it('should remove document', () => {
      const doc = {
        id: '1',
        type: 'article',
        title: 'Test',
        content: 'Content',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      SearchIndexer.indexDocument(doc)
      SearchIndexer.removeDocument('1')
      
      const retrieved = SearchIndexer.getDocument('1')
      expect(retrieved).toBeUndefined()
    })
  })

  describe('updateDocument', () => {
    it('should update document', () => {
      const doc = {
        id: '1',
        type: 'article',
        title: 'Original',
        content: 'Original content',
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      SearchIndexer.indexDocument(doc)
      
      const updated = { ...doc, title: 'Updated' }
      SearchIndexer.updateDocument(updated)
      
      const retrieved = SearchIndexer.getDocument('1')
      expect(retrieved?.title).toBe('Updated')
    })
  })

  describe('getStatistics', () => {
    it('should get statistics', () => {
      SearchIndexer.indexDocument({
        id: '1',
        type: 'article',
        title: 'Test',
        content: 'Content',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const stats = SearchIndexer.getStatistics()
      
      expect(stats.totalDocuments).toBe(1)
      expect(stats.totalTokens).toBeGreaterThan(0)
    })
  })

  describe('suggest', () => {
    it('should suggest completions', () => {
      SearchIndexer.indexDocument({
        id: '1',
        type: 'article',
        title: 'JavaScript Programming',
        content: 'Learn JavaScript',
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      const suggestions = SearchIndexer.suggest('java')
      
      expect(suggestions.length).toBeGreaterThan(0)
      expect(suggestions[0]).toContain('java')
    })
  })

  describe('bulkIndex', () => {
    it('should bulk index documents', () => {
      const docs = [
        {
          id: '1',
          type: 'article',
          title: 'Doc 1',
          content: 'Content 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          type: 'article',
          title: 'Doc 2',
          content: 'Content 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const indexed = SearchIndexer.bulkIndex(docs)
      
      expect(indexed).toBe(2)
      expect(SearchIndexer.getDocument('1')).toBeDefined()
      expect(SearchIndexer.getDocument('2')).toBeDefined()
    })
  })
})
