'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Clock, DollarSign, Activity, FileText, Download, Star, CheckCircle2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import Link from 'next/link'

export default function ExecutionDetailPage() {
  const params = useParams()
  const executionId = params?.executionId as string

  const [execution, setExecution] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [generatingEvidence, setGeneratingEvidence] = useState(false)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [reviewForm, setReviewForm] = useState({
    policyClarityRating: 5,
    accessReliabilityRating: 5,
    evidenceQualityRating: 5,
    overallRating: 5,
    regulatorAccepted: false,
    regulatorName: '',
    auditSuccessful: false,
    auditFeedback: '',
    review: '',
    usedFor: '',
  })

  useEffect(() => {
    if (executionId) {
      fetchExecution()
    }
  }, [executionId])

  const fetchExecution = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/v1/executions/${executionId}`)
      if (res.ok) {
        const data = await res.json()
        setExecution(data)
      } else {
        toast.error('Failed to load execution')
      }
    } catch (error) {
      console.error('Failed to fetch execution:', error)
      toast.error('Failed to load execution')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateEvidence = async () => {
    try {
      setGeneratingEvidence(true)
      const res = await fetch(`/api/v1/executions/${executionId}/evidence`, {
        method: 'POST',
      })

      if (res.ok) {
        const data = await res.json()
        toast.success('Evidence bundle generated!')
        
        // Download evidence
        const blob = new Blob([JSON.stringify(data.evidence, null, 2)], {
          type: 'application/json',
        })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `evidence_${executionId}.json`
        a.click()
        URL.revokeObjectURL(url)

        fetchExecution()
      } else {
        toast.error('Failed to generate evidence')
      }
    } catch (error) {
      console.error('Failed to generate evidence:', error)
      toast.error('Failed to generate evidence')
    } finally {
      setGeneratingEvidence(false)
    }
  }

  const handleSubmitReview = async () => {
    try {
      setSubmittingReview(true)
      const res = await fetch(`/api/v1/executions/${executionId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reviewForm),
      })

      if (res.ok) {
        toast.success('Review submitted successfully!')
        setShowReviewForm(false)
        fetchExecution()
      } else {
        const error = await res.json()
        toast.error(error.error || 'Failed to submit review')
      }
    } catch (error) {
      console.error('Failed to submit review:', error)
      toast.error('Failed to submit review')
    } finally {
      setSubmittingReview(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Skeleton className="h-12 w-2/3 mb-8" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-96 rounded-lg" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 rounded-lg" />
            <Skeleton className="h-64 rounded-lg" />
          </div>
        </div>
      </div>
    )
  }

  if (!execution) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="text-center py-12">
          <h2 className="text-2xl font-semibold mb-2">Execution Not Found</h2>
          <p className="text-muted-foreground">The execution you're looking for doesn't exist.</p>
        </div>
      </div>
    )
  }

  const usageMetrics = execution.usageMetrics || {}
  const constraints = execution.offer.constraints || {}

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">{execution.offer.title}</h1>
            <p className="text-muted-foreground">{execution.policy.usagePurpose}</p>
          </div>
          <Badge className={
            execution.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
            execution.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' :
            execution.status === 'EXPIRED' ? 'bg-gray-100 text-gray-800' :
            'bg-red-100 text-red-800'
          }>
            {execution.status}
          </Badge>
        </div>
        <div className="text-sm text-muted-foreground">
          Execution ID: {execution.executionId}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Usage Metrics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Usage Metrics
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Hours Used */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Hours Used</span>
                  <span className="text-sm text-muted-foreground">
                    {usageMetrics.hoursUsed?.toFixed(2) || 0}h / {execution.policy.maxHours || 0}h
                  </span>
                </div>
                <Progress value={usageMetrics.utilizationPercent || 0} />
                <div className="text-xs text-muted-foreground mt-1">
                  {usageMetrics.utilizationPercent?.toFixed(1) || 0}% utilized
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold">{usageMetrics.requestCount || 0}</div>
                  <div className="text-xs text-muted-foreground">Requests</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold">
                    {usageMetrics.bytesStreamed ? (parseInt(usageMetrics.bytesStreamed) / 1024 / 1024).toFixed(1) : 0} MB
                  </div>
                  <div className="text-xs text-muted-foreground">Data Streamed</div>
                </div>
                <div className="text-center p-4 bg-muted/50 rounded-lg">
                  <div className="text-2xl font-bold">
                    {usageMetrics.currency} {usageMetrics.totalCost || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">Total Cost</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Contract Details */}
          <Card>
            <CardHeader>
              <CardTitle>Contract Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">Allowed Purposes</h4>
                <ul className="space-y-1">
                  {execution.allowedPurposes.map((purpose: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                      <span>{purpose}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-2">Constraints</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Streaming: {constraints.canStream ? '✓' : '✗'}</div>
                  <div>Batch Download: {constraints.canBatchDownload ? '✓' : '✗'}</div>
                  <div>Caching: {constraints.canCache ? '✓' : '✗'}</div>
                  <div>Export: {constraints.canExport ? '✓' : '✗'}</div>
                </div>
              </div>

              <Separator />

              <div className="text-sm space-y-1">
                <div><strong>Jurisdiction:</strong> {execution.offer.jurisdiction}</div>
                <div><strong>Evidence Format:</strong> {execution.offer.evidenceFormat}</div>
                <div><strong>Compliance Level:</strong> {execution.offer.complianceLevel}</div>
              </div>
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Timeline
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span>Started</span>
                <span className="font-medium">{new Date(execution.startedAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Expires</span>
                <span className="font-medium">{new Date(execution.expiresAt).toLocaleString()}</span>
              </div>
              {execution.completedAt && (
                <div className="flex items-center justify-between">
                  <span>Completed</span>
                  <span className="font-medium">{new Date(execution.completedAt).toLocaleString()}</span>
                </div>
              )}
              {execution.evidenceGeneratedAt && (
                <div className="flex items-center justify-between">
                  <span>Evidence Generated</span>
                  <span className="font-medium">{new Date(execution.evidenceGeneratedAt).toLocaleString()}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Evidence */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Evidence Bundle
              </CardTitle>
              <CardDescription>
                Cryptographic proof of access and usage
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {execution.evidenceHash ? (
                <>
                  <div className="text-sm">
                    <div className="font-medium mb-1">Hash</div>
                    <div className="font-mono text-xs break-all bg-muted p-2 rounded">
                      {execution.evidenceHash}
                    </div>
                  </div>
                  <Button onClick={handleGenerateEvidence} disabled={generatingEvidence} className="w-full">
                    <Download className="h-4 w-4 mr-2" />
                    {generatingEvidence ? 'Generating...' : 'Download Evidence'}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Generate a cryptographic evidence bundle for audit and compliance purposes.
                  </p>
                  <Button onClick={handleGenerateEvidence} disabled={generatingEvidence} className="w-full">
                    {generatingEvidence ? 'Generating...' : 'Generate Evidence'}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Review */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Review
              </CardTitle>
              <CardDescription>
                Rate the legal utility of this contract
              </CardDescription>
            </CardHeader>
            <CardContent>
              {execution.review ? (
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Overall Rating</span>
                    <Badge>{execution.review.overallRating}/5</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Policy Clarity</span>
                    <span>{execution.review.policyClarityRating}/5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Access Reliability</span>
                    <span>{execution.review.accessReliabilityRating}/5</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Evidence Quality</span>
                    <span>{execution.review.evidenceQualityRating}/5</span>
                  </div>
                  {execution.review.auditSuccessful && (
                    <Badge variant="outline" className="w-full justify-center">
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Audit Successful
                    </Badge>
                  )}
                </div>
              ) : !showReviewForm ? (
                <Button onClick={() => setShowReviewForm(true)} className="w-full">
                  Submit Review
                </Button>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Policy Clarity (1-5)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewForm.policyClarityRating}
                      onChange={(e) => setReviewForm({ ...reviewForm, policyClarityRating: parseInt(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Access Reliability (1-5)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewForm.accessReliabilityRating}
                      onChange={(e) => setReviewForm({ ...reviewForm, accessReliabilityRating: parseInt(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Evidence Quality (1-5)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewForm.evidenceQualityRating}
                      onChange={(e) => setReviewForm({ ...reviewForm, evidenceQualityRating: parseInt(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Overall Rating (1-5)</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={reviewForm.overallRating}
                      onChange={(e) => setReviewForm({ ...reviewForm, overallRating: parseInt(e.target.value) })}
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Review (optional)</label>
                    <Textarea
                      value={reviewForm.review}
                      onChange={(e) => setReviewForm({ ...reviewForm, review: e.target.value })}
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={reviewForm.auditSuccessful}
                      onChange={(e) => setReviewForm({ ...reviewForm, auditSuccessful: e.target.checked })}
                      id="audit"
                    />
                    <label htmlFor="audit" className="text-sm">Audit Successful</label>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleSubmitReview} disabled={submittingReview} className="flex-1">
                      {submittingReview ? 'Submitting...' : 'Submit'}
                    </Button>
                    <Button variant="outline" onClick={() => setShowReviewForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lease Info */}
          <Card>
            <CardHeader>
              <CardTitle>Lease Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><strong>Lease ID:</strong> {execution.lease.leaseId}</div>
              <div><strong>Status:</strong> <Badge variant="outline">{execution.lease.status}</Badge></div>
              <div><strong>Issued:</strong> {new Date(execution.lease.issuedAt).toLocaleDateString()}</div>
              <div><strong>Expires:</strong> {new Date(execution.lease.expiresAt).toLocaleDateString()}</div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/xase/governed-access/${execution.offer.offerId}`}>
                <Button variant="outline" className="w-full">
                  View Original Contract
                </Button>
              </Link>
              <Link href="/xase/executions">
                <Button variant="outline" className="w-full">
                  Back to All Executions
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
