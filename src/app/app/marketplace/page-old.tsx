'use client'

import { useState, useEffect } from 'react'
import { AccessOfferCard } from '@/components/xase/access-offer-card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Slider } from '@/components/ui/slider'
import { Search, Filter, LayoutGrid, List, Info } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { AppLayout } from '@/components/AppSidebar'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function GovernedAccessCatalogPage() {
  const [offers, setOffers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<'relevance' | 'price_asc' | 'newest' | 'accessed_desc'>('relevance')
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
      if (filters.search) params.set('q', filters.search)
      if (sort && sort !== 'relevance') params.set('sort', sort)

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

  // Derived metrics for hero strip (from real data only)
  const metrics = (() => {
    if (!offers || offers.length === 0) return { count: 0, jurisdictions: 0, risks: 0 }
    const j = new Set(offers.map((o: any) => o.jurisdiction).filter(Boolean))
    const r = new Set(offers.map((o: any) => o.riskClass).filter(Boolean))
    return { count: offers.length, jurisdictions: j.size, risks: r.size }
  })()

  return (
    <AppLayout>
      <div className="min-h-screen bg-white">
        <div className="max-w-[1600px] mx-auto px-6 md:px-10 py-8 space-y-8">
          {/* Hero strip */}
          <div className="bg-white border-b border-gray-200">
            <div className="py-4 flex items-start justify-between gap-4">
              <div>
                <h1 className={`${heading.className} text-[30px] leading-8 font-semibold text-gray-900 tracking-tight`}>
                  Governed Access Marketplace
                </h1>
                <p className="text-sm text-gray-600 mt-1">Executable data access contracts with cryptographic enforcement.</p>
              </div>
              <div className="hidden md:flex items-center gap-2 text-[11px] text-gray-700">
                <Badge variant="secondary">{metrics.count} Active Contracts</Badge>
                <Separator orientation="vertical" className="h-4" />
                <Badge variant="secondary">{metrics.jurisdictions} Jurisdictions</Badge>
                <Separator orientation="vertical" className="h-4" />
                <Badge variant="secondary">{metrics.risks} Risk Classes</Badge>
                <Separator orientation="vertical" className="h-4" />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline">Evidence-native</Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      Contracts produce tamper-proof evidence bundles for audits.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* Compliance confidence */}
          <Alert className="border-gray-200">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-[13px] text-gray-700">
              All contracts are cryptographically enforced and generate tamper-proof evidence bundles.
            </AlertDescription>
          </Alert>

          {/* Control panel filters */}
          <div className="bg-white border border-gray-200 rounded-xl p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
              {/* Risk segmented selector */}
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-gray-600" />
                <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                  {['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((r) => (
                    <Button
                      key={r || 'ALL'}
                      size="sm"
                      variant={(filters.riskClass === r) || (r === '' && !filters.riskClass) ? 'default' : 'ghost'}
                      className="rounded-none"
                      onClick={() => handleFilterChange('riskClass', r)}
                    >
                      {r || 'ALL'}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div className="flex-1 min-w-[160px]">
                <Input placeholder="Language e.g., en-US" value={filters.language} onChange={(e) => handleFilterChange('language', e.target.value)} />
              </div>

              {/* Jurisdiction */}
              <div className="flex-1 min-w-[160px]">
                <Input placeholder="Jurisdiction e.g., EU" value={filters.jurisdiction} onChange={(e) => handleFilterChange('jurisdiction', e.target.value)} />
              </div>

              {/* Max price slider */}
              <div className="min-w-[200px]">
                <div className="text-[11px] text-gray-700 mb-1">Max Price (per hour): {filters.maxPrice || 'Any'}</div>
                <Slider defaultValue={[Number(filters.maxPrice) || 0]} max={200} step={5} onValueChange={(v) => handleFilterChange('maxPrice', String(v[0] || ''))} />
              </div>

              {/* Search */}
              <div className="flex-1 min-w-[200px]">
                <Input placeholder="Search datasets, use cases, providers…" value={filters.search} onChange={(e) => handleFilterChange('search', e.target.value)} />
              </div>

              {/* Recompute */}
              <div>
                <Button onClick={applyFilters} className="whitespace-nowrap">
                  <Search className="h-4 w-4 mr-2" />
                  Recompute Results
                </Button>
              </div>
            </div>

            {/* Active filters badges */}
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {filters.riskClass && <Badge variant="secondary">Risk: {filters.riskClass}</Badge>}
              {filters.language && <Badge variant="secondary">Lang: {filters.language}</Badge>}
              {filters.jurisdiction && <Badge variant="secondary">Jurisdiction: {filters.jurisdiction}</Badge>}
              {filters.maxPrice && <Badge variant="secondary">≤ ${filters.maxPrice}/hr</Badge>}
              {filters.useCase && <Badge variant="secondary">Use case: {filters.useCase}</Badge>}
              {filters.search && <Badge variant="secondary">Search: “{filters.search}”</Badge>}
            </div>
          </div>

          {/* Results header: sorting + view toggle */}
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-gray-900">
              {loading ? 'Loading…' : `${offers.length} Executable Contracts`}
            </h2>
            <div className="flex items-center gap-3">
              <Select value={sort} onValueChange={(v: any) => setSort(v)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Sort: Relevance</SelectItem>
                  <SelectItem value="price_asc">Sort: Price (low → high)</SelectItem>
                  <SelectItem value="newest">Sort: Newest</SelectItem>
                  <SelectItem value="accessed_desc">Sort: Most accessed</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                <Button size="sm" variant={view === 'grid' ? 'default' : 'ghost'} className="rounded-none" onClick={() => setView('grid')}>
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button size="sm" variant={view === 'list' ? 'default' : 'ghost'} className="rounded-none" onClick={() => setView('list')}>
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[320px] rounded-lg" />
              ))}
            </div>
          ) : offers.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 border border-gray-200 rounded-xl">
              <p className="text-sm text-gray-600">No access contracts found matching your criteria.</p>
            </div>
          ) : (
            view === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {offers.map((offer) => (
                  <AccessOfferCard key={offer.offerId} offer={offer} />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {offers.map((offer) => (
                  <div key={offer.offerId} className="bg-white border border-gray-200 rounded-xl p-4">
                    <AccessOfferCard offer={offer} />
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </AppLayout>
  )
}
