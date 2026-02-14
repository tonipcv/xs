'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Shield, DollarSign, Clock, Globe, FileText, CheckCircle2, AlertCircle } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { Playfair_Display } from 'next/font/google'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function AccessOfferDetailPage() {
  const params = useParams()
  const router = useRouter()
  const offerId = params.offerId as string

  const [offer, setOffer] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestForm, setRequestForm] = useState({
    usagePurpose: '',
    requestedHours: '',
    environment: '',
  })

  useEffect(() => {
    fetchOffer()
  }, [offerId])

  const fetchOffer = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/v1/access-offers/${offerId}`)
      if (res.ok) {
        const data = await res.json()
        setOffer(data)
      } else {
        toast.error('Failed to load offer')
      }
    } catch (error) {
      console.error('Failed to fetch offer:', error)
      toast.error('Failed to load offer')
    } finally {
      setLoading(false)
    }
  }

  const handleRequestAccess = async () => {
    if (!requestForm.usagePurpose.trim()) {
      toast.error('Please describe your usage purpose')
      return
    }

    try {
      setRequesting(true)
      const res = await fetch(`/api/v1/access-offers/${offerId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usagePurpose: requestForm.usagePurpose,
          requestedHours: requestForm.requestedHours ? parseFloat(requestForm.requestedHours) : undefined,
          environment: requestForm.environment,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        toast.success('Access granted! Redirecting to your execution...')
        setTimeout(() => {
          router.push(`/xase/executions/${data.execution.executionId}`)
        }, 1500)
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to request access')
      }
    } catch (error) {
      console.error('Failed to request access:', error)
      toast.error('Failed to request access')
    } finally {
      setRequesting(false)
    }
  }

  if (loading) {
    return (
      <div>
        <Skeleton className="h-12 w-2/3 mb-4" />
        <Skeleton className="h-6 w-1/2 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Skeleton className="h-[600px] rounded-lg" />
          </div>
          <div>
            <Skeleton className="h-[400px] rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (!offer) {
    return (
      <div>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h2 className="text-2xl font-semibold mb-2">Offer Not Found</h2>
          <p className="text-muted-foreground">The access offer you're looking for doesn't exist.</p>
        </div>
      </div>
    )
  }

  const constraints = offer.constraints || {}

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className={`${heading.className} text-3xl font-semibold text-gray-900 tracking-tight mb-2`}>{offer.title}</h1>
            <p className="text-sm text-gray-600 max-w-3xl">{offer.description}</p>
          </div>
          <Badge className={'bg-gray-100 text-gray-800 border border-gray-300'}>
            {offer.riskClass} RISK
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-gray-600">
          <div className="flex items-center gap-1">
            <Shield className="h-4 w-4 text-gray-500" />
            <span>{offer.supplier.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Globe className="h-4 w-4 text-gray-500" />
            <span>{offer.jurisdiction}</span>
          </div>
          <Badge variant="secondary">{offer.language}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pricing */}
          <Card className="bg-white border border-gray-200 rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <DollarSign className="h-5 w-5 text-gray-500" />
                Pricing & Scope
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-medium text-gray-900">{offer.currency} {offer.pricePerHour}</span>
                <span className="text-gray-600">per hour</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <Clock className="h-4 w-4 text-gray-500" />
                <span>Scope: {offer.scopeHours} hours</span>
                {offer.scopeRecordings && <span>• {offer.scopeRecordings} recordings</span>}
              </div>
              <div className="text-sm text-gray-600">
                Price Model: {offer.priceModel.replace(/_/g, ' ')}
              </div>
            </CardContent>
          </Card>

          {/* Allowed Purposes */}
          <Card className="bg-white border border-gray-200 rounded-xl">
            <CardHeader>
              <CardTitle className="text-gray-900">Allowed Purposes</CardTitle>
              <CardDescription className="text-gray-600">What you can use this data for</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-gray-800">
                {offer.allowedPurposes.map((purpose: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-gray-500 mt-0.5 flex-shrink-0" />
                    <span>{purpose}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Constraints (Streaming-only) */}
          <Card className="bg-white border border-gray-200 rounded-xl">
            <CardHeader>
              <CardTitle className="text-gray-900">Access Constraints</CardTitle>
              <CardDescription className="text-gray-600">Governed access: streaming only</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-gray-900">Streaming:</span>
                  <Badge variant={constraints.canStream ? 'default' : 'secondary'} className="ml-2">
                    {constraints.canStream ? 'Allowed' : 'Not Allowed'}
                  </Badge>
                </div>
                <div className="text-sm text-gray-600">
                  Downloads, exports and offline caching are not permitted under Xase governed access.
                </div>
              </div>
              <Separator className="my-4" />
              <div className="space-y-2 text-sm text-gray-800">
                <div><strong className="text-gray-900">Retention Policy:</strong> {constraints.retentionPolicy}</div>
                {constraints.maxConcurrentStreams && (
                  <div><strong className="text-gray-900">Max Concurrent Streams:</strong> {constraints.maxConcurrentStreams}</div>
                )}
                {constraints.rateLimit && (
                  <div><strong className="text-gray-900">Rate Limit:</strong> {constraints.rateLimit}</div>
                )}
                <div><strong className="text-gray-900">Encryption Required:</strong> {constraints.requiresEncryption ? 'Yes' : 'No'}</div>
                <div><strong className="text-gray-900">Audit Log Required:</strong> {constraints.requiresAuditLog ? 'Yes' : 'No'}</div>
              </div>
            </CardContent>
          </Card>

          {/* Legal Guarantees */}
          <Card className="bg-white border border-gray-200 rounded-xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-gray-900">
                <FileText className="h-5 w-5 text-gray-500" />
                Legal Guarantees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-gray-800">
              <div><strong className="text-gray-900">Jurisdiction:</strong> {offer.jurisdiction}</div>
              <div><strong className="text-gray-900">Evidence Format:</strong> {offer.evidenceFormat}</div>
              <div><strong className="text-gray-900">Compliance Level:</strong> {offer.complianceLevel}</div>
            </CardContent>
          </Card>

          {/* Dataset Info */}
          {offer.dataset && (
            <Card className="bg-white border border-gray-200 rounded-xl">
              <CardHeader>
                <CardTitle className="text-gray-900">Dataset Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-gray-800">
                <div><strong className="text-gray-900">Name:</strong> {offer.dataset.name}</div>
                <div><strong className="text-gray-900">Total Duration:</strong> {offer.dataset.totalDurationHours}h</div>
                <div><strong className="text-gray-900">Recordings:</strong> {offer.dataset.numRecordings}</div>
                <div><strong className="text-gray-900">Language:</strong> {offer.dataset.primaryLanguage}</div>
                <div><strong className="text-gray-900">Sample Rate:</strong> {offer.dataset.primarySampleRate} Hz</div>
                <div><strong className="text-gray-900">Codec:</strong> {offer.dataset.primaryCodec}</div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Request Access */}
          <Card className="bg-white border border-gray-200 rounded-xl">
            <CardHeader>
              <CardTitle className="text-gray-900">Request Governed Access</CardTitle>
              <CardDescription className="text-gray-600">Execute this access contract</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showRequestModal ? (
                <Button
                  className="w-full h-9 text-sm bg-gray-900 hover:bg-gray-800 text-white"
                  onClick={() => setShowRequestModal(true)}
                >
                  Request Access
                </Button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block text-gray-900">Usage Purpose *</label>
                    <Textarea
                      placeholder="Describe how you will use this data..."
                      value={requestForm.usagePurpose}
                      onChange={(e) => setRequestForm({ ...requestForm, usagePurpose: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block text-gray-900">Requested Hours (optional)</label>
                    <Input
                      type="number"
                      placeholder={`Max: ${offer.scopeHours}`}
                      value={requestForm.requestedHours}
                      onChange={(e) => setRequestForm({ ...requestForm, requestedHours: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block text-gray-900">Environment (optional)</label>
                    <Input
                      placeholder="e.g., production, staging"
                      value={requestForm.environment}
                      onChange={(e) => setRequestForm({ ...requestForm, environment: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleRequestAccess} disabled={requesting} className="flex-1 bg-gray-900 hover:bg-gray-800 text-white">
                      {requesting ? 'Requesting...' : 'Confirm Request'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowRequestModal(false)} className="border-gray-300 text-gray-800 hover:bg-gray-50">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          
        </div>
      </div>
    </div>
  )
}
