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
import { Card, CardContent } from '@/components/ui/card'
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

  // Auto-apply filters and sorting with debounce
  useEffect(() => {
    const h = setTimeout(() => {
      fetchOffers()
    }, 300)
    return () => clearTimeout(h)
  }, [filters, sort])

  const fetchOffers = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (filters.riskClass) params.set('riskClass', filters.riskClass)
      if (filters.language) params.set('language', filters.language)
      if (filters.jurisdiction) params.set('jurisdiction', filters.jurisdiction)
      // maxPrice removed from UI; do not include in params
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
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[1600px] mx-auto px-6 md:px-10 py-6 space-y-5">
          
          {/* Hero strip - Clean and minimal */}
          <Card className="border-gray-200 shadow-none bg-white">
            <CardContent className="py-4 px-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className={`${heading.className} text-[26px] leading-tight font-semibold text-gray-900`}>
                    Governed Access Marketplace
                  </h1>
                  <p className="text-[13px] text-gray-600 mt-1">Executable data access contracts with cryptographic enforcement.</p>
                </div>
                <div className="hidden md:flex items-center gap-2 text-[11px]">
                  <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-0">{metrics.count} Contracts</Badge>
                  <Separator orientation="vertical" className="h-3" />
                  <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-0">{metrics.jurisdictions} Jurisdictions</Badge>
                  <Separator orientation="vertical" className="h-3" />
                  <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-0">{metrics.risks} Risk Classes</Badge>
                  <Separator orientation="vertical" className="h-3" />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="border-gray-300 text-gray-700">Evidence-native</Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="text-xs">Contracts produce tamper-proof evidence bundles</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Compliance confidence */}
          <Alert className="border-gray-200 bg-gray-50">
            <Info className="h-4 w-4 text-gray-600" />
            <AlertDescription className="text-[12px] text-gray-800">
              All contracts are cryptographically enforced and generate tamper-proof evidence bundles.
            </AlertDescription>
          </Alert>

          {/* Control panel filters - Databricks style toolbar */}
          <Card className="border-gray-200 shadow-sm bg-white">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                {/* Top row: Risk selector + inputs */}
                <div className="flex flex-wrap items-center gap-2">
                  <Filter className="h-4 w-4 text-gray-500" />
                  
                  {/* Risk segmented selector */}
                  <div className="flex rounded-md border border-gray-300 overflow-hidden">
                    {['', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((r) => (
                      <Button
                        key={r || 'ALL'}
                        size="sm"
                        variant="ghost"
                        className={`rounded-none h-7 px-3 text-[11px] font-medium border-r border-gray-300 last:border-r-0 ${
                          (filters.riskClass === r) || (r === '' && !filters.riskClass)
                            ? 'bg-gray-900 text-white hover:bg-gray-800 hover:text-white'
                            : 'bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                        onClick={() => handleFilterChange('riskClass', r)}
                      >
                        {r || 'ALL'}
                      </Button>
                    ))}
                  </div>

                  <Separator orientation="vertical" className="h-6" />

                  {/* Language */}
                  <Input 
                    placeholder="Language" 
                    value={filters.language} 
                    onChange={(e) => handleFilterChange('language', e.target.value)}
                    className="h-7 w-[140px] text-[12px] border-gray-300"
                  />

                  {/* Jurisdiction */}
                  <Input 
                    placeholder="Jurisdiction" 
                    value={filters.jurisdiction} 
                    onChange={(e) => handleFilterChange('jurisdiction', e.target.value)}
                    className="h-7 w-[140px] text-[12px] border-gray-300"
                  />

                  {/* Search */}
                  <Input 
                    placeholder="Search datasets, providers…" 
                    value={filters.search} 
                    onChange={(e) => handleFilterChange('search', e.target.value)}
                    className="h-7 flex-1 min-w-[200px] text-[12px] border-gray-300"
                  />

                  {/* Apply button */}
                  <Button onClick={applyFilters} size="sm" className="h-7 px-3 text-[11px] bg-gray-900 hover:bg-gray-800">
                    <Search className="h-3 w-3 mr-1.5" />
                    Search
                  </Button>
                </div>

                

                {/* Active filters badges */}
                {(filters.riskClass || filters.language || filters.jurisdiction || filters.search) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100">
                    <span className="text-[10px] text-gray-500 font-medium">Active:</span>
                    {filters.riskClass && <Badge variant="secondary" className="h-5 text-[10px] bg-gray-100 text-gray-700">Risk: {filters.riskClass}</Badge>}
                    {filters.language && <Badge variant="secondary" className="h-5 text-[10px] bg-gray-100 text-gray-700">Lang: {filters.language}</Badge>}
                    {filters.jurisdiction && <Badge variant="secondary" className="h-5 text-[10px] bg-gray-100 text-gray-700">{filters.jurisdiction}</Badge>}
                    {filters.search && <Badge variant="secondary" className="h-5 text-[10px] bg-gray-100 text-gray-700">"{filters.search}"</Badge>}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Results header: count + sorting + view toggle */}
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-medium text-gray-900">
              {loading ? 'Loading…' : `${offers.length} Executable Contracts`}
            </h2>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(v: any) => setSort(v)}>
                <SelectTrigger className="h-7 w-[160px] text-[11px] border-gray-300 text-gray-900">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance" className="text-[11px]">Relevance</SelectItem>
                  <SelectItem value="price_asc" className="text-[11px]">Price: Low → High</SelectItem>
                  <SelectItem value="newest" className="text-[11px]">Newest</SelectItem>
                  <SelectItem value="accessed_desc" className="text-[11px]">Most Accessed</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="flex rounded-md border border-gray-300 overflow-hidden">
                <Button 
                  size="sm" 
                  variant="ghost"
                  className={`rounded-none h-7 w-7 p-0 border-r border-gray-300 ${view === 'grid' ? 'bg-gray-900 text-white hover:bg-gray-800 hover:text-white' : 'bg-white hover:bg-gray-50'}`}
                  onClick={() => setView('grid')}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className={`rounded-none h-7 w-7 p-0 ${view === 'list' ? 'bg-gray-900 text-white hover:bg-gray-800 hover:text-white' : 'bg-white hover:bg-gray-50'}`}
                  onClick={() => setView('list')}
                >
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-[280px] rounded-lg" />
              ))}
            </div>
          ) : offers.length === 0 ? (
            <Card className="border-gray-200">
              <CardContent className="py-12 text-center">
                <p className="text-[13px] text-gray-600">No contracts found matching your criteria.</p>
              </CardContent>
            </Card>
          ) : (
            view === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {offers.map((offer) => (
                  <Card key={offer.offerId} className="border-gray-200 hover:shadow-md transition-shadow bg-white">
                    <CardContent className="p-0">
                      <AccessOfferCard offer={offer} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {offers.map((offer) => (
                  <Card key={offer.offerId} className="border-gray-200 hover:shadow-md transition-shadow bg-white">
                    <CardContent className="p-4">
                      <AccessOfferCard offer={offer} />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </AppLayout>
  )
}
