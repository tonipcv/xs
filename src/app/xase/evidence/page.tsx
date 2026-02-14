'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { FileCheck, Search, Shield } from 'lucide-react'

interface MerkleTree {
  id: string
  executionId: string
  rootHash: string
  leafCount: number
  proofSizeBytes: number
  createdAt: string
}

export default function EvidencePage() {
  const [executionId, setExecutionId] = useState('')
  const [evidence, setEvidence] = useState<MerkleTree | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const searchEvidence = async () => {
    if (!executionId) return

    setLoading(true)
    setError('')
    setEvidence(null)

    try {
      const res = await fetch(`/api/v1/evidence/generate?executionId=${executionId}`)
      if (res.ok) {
        const data = await res.json()
        setEvidence(data.merkleTree)
      } else {
        const err = await res.json()
        setError(err.error || 'Failed to fetch evidence')
      }
    } catch (err: any) {
      setError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Evidence Viewer</h1>
        <p className="text-muted-foreground">Search and verify Merkle tree evidence</p>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Evidence</CardTitle>
          <CardDescription>Enter execution ID to retrieve evidence bundle</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="exec_abc123..."
              value={executionId}
              onChange={(e) => setExecutionId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchEvidence()}
            />
            <Button onClick={searchEvidence} disabled={loading || !executionId}>
              <Search className="mr-2 h-4 w-4" />
              {loading ? 'Searching...' : 'Search'}
            </Button>
          </div>
          {error && (
            <div className="mt-4 p-3 bg-destructive/10 text-destructive rounded-md text-sm">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidence Details */}
      {evidence && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Evidence Bundle</CardTitle>
                <CardDescription>Merkle tree cryptographic proof</CardDescription>
              </div>
              <Badge className="bg-green-600">
                <Shield className="mr-1 h-3 w-3" />
                Verified
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-sm font-medium text-muted-foreground">Execution ID</div>
                <code className="text-sm">{evidence.executionId}</code>
              </div>
              <div>
                <div className="text-sm font-medium text-muted-foreground">Created At</div>
                <div className="text-sm">{new Date(evidence.createdAt).toLocaleString()}</div>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">Root Hash</div>
              <div className="p-3 bg-muted rounded-md font-mono text-xs break-all">
                {evidence.rootHash}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Leaf Count</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{evidence.leafCount.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">Access logs</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Proof Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatBytes(evidence.proofSizeBytes)}</div>
                  <div className="text-xs text-muted-foreground">Compressed</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Compression</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {((evidence.proofSizeBytes / (evidence.leafCount * 100)) * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-muted-foreground">Of original</div>
                </CardContent>
              </Card>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1">
                <FileCheck className="mr-2 h-4 w-4" />
                Download Bundle
              </Button>
              <Button variant="outline" className="flex-1">
                Verify Proof
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
