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
      <div className="container mx-auto py-8 px-4">
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
      <div className="container mx-auto py-8 px-4">
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
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">{offer.title}</h1>
            <p className="text-muted-foreground text-lg">{offer.description}</p>
          </div>
          <Badge className={
            offer.riskClass === 'LOW' ? 'bg-green-100 text-green-800' :
            offer.riskClass === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
            offer.riskClass === 'HIGH' ? 'bg-orange-100 text-orange-800' :
            'bg-red-100 text-red-800'
          }>
            {offer.riskClass} RISK
          </Badge>
        </div>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <Shield className="h-4 w-4" />
            <span>{offer.supplier.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <Globe className="h-4 w-4" />
            <span>{offer.jurisdiction}</span>
          </div>
          <Badge variant="secondary">{offer.language}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing & Scope
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{offer.currency} {offer.pricePerHour}</span>
                <span className="text-muted-foreground">per hour</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span>Scope: {offer.scopeHours} hours</span>
                {offer.scopeRecordings && <span>• {offer.scopeRecordings} recordings</span>}
              </div>
              <div className="text-sm text-muted-foreground">
                Price Model: {offer.priceModel.replace(/_/g, ' ')}
              </div>
            </CardContent>
          </Card>

          {/* Allowed Purposes */}
          <Card>
            <CardHeader>
              <CardTitle>Allowed Purposes</CardTitle>
              <CardDescription>What you can use this data for</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {offer.allowedPurposes.map((purpose: string, i: number) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>{purpose}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Constraints (Streaming-only) */}
          <Card>
            <CardHeader>
              <CardTitle>Access Constraints</CardTitle>
              <CardDescription>Governed access: streaming only</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium">Streaming:</span>
                  <Badge variant={constraints.canStream ? 'default' : 'secondary'} className="ml-2">
                    {constraints.canStream ? 'Allowed' : 'Not Allowed'}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Downloads, exports and offline caching are not permitted under Xase governed access.
                </div>
              </div>
              <Separator className="my-4" />
              <div className="space-y-2 text-sm">
                <div><strong>Retention Policy:</strong> {constraints.retentionPolicy}</div>
                {constraints.maxConcurrentStreams && (
                  <div><strong>Max Concurrent Streams:</strong> {constraints.maxConcurrentStreams}</div>
                )}
                {constraints.rateLimit && (
                  <div><strong>Rate Limit:</strong> {constraints.rateLimit}</div>
                )}
                <div><strong>Encryption Required:</strong> {constraints.requiresEncryption ? 'Yes' : 'No'}</div>
                <div><strong>Audit Log Required:</strong> {constraints.requiresAuditLog ? 'Yes' : 'No'}</div>
              </div>
            </CardContent>
          </Card>

          {/* Legal Guarantees */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Legal Guarantees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><strong>Jurisdiction:</strong> {offer.jurisdiction}</div>
              <div><strong>Evidence Format:</strong> {offer.evidenceFormat}</div>
              <div><strong>Compliance Level:</strong> {offer.complianceLevel}</div>
            </CardContent>
          </Card>

          {/* Dataset Info */}
          {offer.dataset && (
            <Card>
              <CardHeader>
                <CardTitle>Dataset Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div><strong>Name:</strong> {offer.dataset.name}</div>
                <div><strong>Total Duration:</strong> {offer.dataset.totalDurationHours}h</div>
                <div><strong>Recordings:</strong> {offer.dataset.numRecordings}</div>
                <div><strong>Language:</strong> {offer.dataset.primaryLanguage}</div>
                <div><strong>Sample Rate:</strong> {offer.dataset.primarySampleRate} Hz</div>
                <div><strong>Codec:</strong> {offer.dataset.primaryCodec}</div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Request Access */}
          <Card>
            <CardHeader>
              <CardTitle>Request Governed Access</CardTitle>
              <CardDescription>Execute this access contract</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!showRequestModal ? (
                <Button onClick={() => setShowRequestModal(true)} className="w-full" size="lg">
                  Request Access
                </Button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">Usage Purpose *</label>
                    <Textarea
                      placeholder="Describe how you will use this data..."
                      value={requestForm.usagePurpose}
                      onChange={(e) => setRequestForm({ ...requestForm, usagePurpose: e.target.value })}
                      rows={4}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Requested Hours (optional)</label>
                    <Input
                      type="number"
                      placeholder={`Max: ${offer.scopeHours}`}
                      value={requestForm.requestedHours}
                      onChange={(e) => setRequestForm({ ...requestForm, requestedHours: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-2 block">Environment (optional)</label>
                    <Input
                      placeholder="e.g., production, staging"
                      value={requestForm.environment}
                      onChange={(e) => setRequestForm({ ...requestForm, environment: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleRequestAccess} disabled={requesting} className="flex-1">
                      {requesting ? 'Requesting...' : 'Confirm Request'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowRequestModal(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Trust Signals */}
          <Card>
            <CardHeader>
              <CardTitle>Trust Signals</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm">Successful Audits</span>
                <Badge variant="outline">{offer.successfulAudits}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">Total Executions</span>
                <Badge variant="outline">{offer.totalExecutions}</Badge>
              </div>
              {offer.averageCompliance && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Avg Compliance</span>
                  <Badge variant="outline">{offer.averageCompliance.toFixed(1)}/5</Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reviews */}
          {offer.reviews && offer.reviews.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Reviews</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {offer.reviews.slice(0, 3).map((review: any, i: number) => (
                  <div key={i} className="border-b pb-3 last:border-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline">{review.overallRating}/5</Badge>
                      {review.auditSuccessful && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Policy: {review.policyClarityRating}/5 • 
                      Access: {review.accessReliabilityRating}/5 • 
                      Evidence: {review.evidenceQualityRating}/5
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
