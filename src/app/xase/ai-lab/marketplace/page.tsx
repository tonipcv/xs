'use client'

import { useState, useEffect } from 'react'
import { AccessOfferCard } from '@/components/xase/access-offer-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Filter } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

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
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Governed Access Catalog</h1>
        <p className="text-muted-foreground text-lg">
          Discover executable access contracts with built-in governance, evidence generation, and legal guarantees.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-card border rounded-lg p-6 mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Filters</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Risk Class</label>
            <Select
              value={filters.riskClass || 'ALL'}
              onValueChange={(value) => handleFilterChange('riskClass', value === 'ALL' ? '' : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Language</label>
            <Input
              placeholder="e.g., en-US"
              value={filters.language}
              onChange={(e) => handleFilterChange('language', e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Jurisdiction</label>
            <Input
              placeholder="e.g., US, EU"
              value={filters.jurisdiction}
              onChange={(e) => handleFilterChange('jurisdiction', e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-2 block">Max Price (per hour)</label>
            <Input
              type="number"
              placeholder="e.g., 50"
              value={filters.maxPrice}
              onChange={(e) => handleFilterChange('maxPrice', e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4">
          <Button onClick={applyFilters} className="w-full md:w-auto">
            <Search className="h-4 w-4 mr-2" />
            Apply Filters
          </Button>
        </div>
      </div>

      {/* Results */}
      <div className="mb-4">
        <h2 className="text-2xl font-semibold">
          {loading ? 'Loading...' : `${offers.length} Access Contracts Available`}
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-[400px] rounded-lg" />
          ))}
        </div>
      ) : offers.length === 0 ? (
        <div className="text-center py-12 bg-muted/50 rounded-lg">
          <p className="text-muted-foreground text-lg">
            No access contracts found matching your criteria.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {offers.map((offer) => (
            <AccessOfferCard key={offer.offerId} offer={offer} />
          ))}
        </div>
      )}
    </div>
  )
}
