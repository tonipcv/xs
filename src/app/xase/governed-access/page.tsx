'use client'

import { useState, useEffect } from 'react'
import { AccessOfferCard } from '@/components/xase/access-offer-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Filter } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function GovernedAccessCatalogPage() {
  const [offers, setOffers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    riskClass: '',
    language: '',
    jurisdiction: '',
    maxPrice: '',
    useCase: '',
    search: '',
  })

  useEffect(() => {
    fetchOffers()
  }, [])

  const fetchOffers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.riskClass) params.set('riskClass', filters.riskClass)
      if (filters.language) params.set('language', filters.language)
      if (filters.jurisdiction) params.set('jurisdiction', filters.jurisdiction)
      if (filters.maxPrice) params.set('maxPrice', filters.maxPrice)
      if (filters.useCase) params.set('useCase', filters.useCase)

      const res = await fetch(`/api/v1/access-offers?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setOffers(data.offers)
      }
    } catch (error) {
      console.error('Failed to fetch offers:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  const applyFilters = () => {
    fetchOffers()
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight mb-2`}>Governed Access Catalog</h1>
        <p className="text-sm text-gray-600">
          Discover executable access contracts with built-in governance, evidence generation, and legal guarantees.
        </p>
      </div>

      {/* Filters (simplified) */}
      <div className="bg-white border border-gray-200 rounded-md p-2 mb-2">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
          <div>
            <label className="text-xs font-medium mb-0.5 block text-gray-900">Risk Class</label>
            <select
              value={filters.riskClass || 'ALL'}
              onChange={(e) => handleFilterChange('riskClass', e.target.value === 'ALL' ? '' : e.target.value)}
              className="h-7 text-xs border border-gray-300 rounded-md px-2 bg-white focus:outline-none focus:ring-0 focus:border-gray-400"
            >
              <option value="ALL">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium mb-0.5 block text-gray-900">Max Price (per hour)</label>
            <Input
              type="number"
              placeholder="e.g., 50"
              value={filters.maxPrice}
              onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
              className="h-7 text-xs focus:outline-none focus:ring-0"
            />
          </div>

          <div className="flex items-end justify-end">
            <Button onClick={applyFilters} className="w-full md:w-auto h-7 px-2 text-xs bg-gray-900 hover:bg-gray-800 text-white rounded-md">
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-900 tabular-nums">
          {loading ? 'Loading...' : `${offers.length} Access Contracts Available`}
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[400px] rounded-lg" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-12 bg-white border border-gray-200 rounded-xl">
          <p className="text-sm text-gray-600">
            No access contracts found matching your criteria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {offers.map((offer) => (
            <AccessOfferCard key={offer.offerId} offer={offer} />
          ))}
        </div>
      )}
    </div>
  )
}
