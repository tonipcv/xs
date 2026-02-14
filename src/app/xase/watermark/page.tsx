'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Upload, Search, AlertCircle } from 'lucide-react'

export default function WatermarkPage() {
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setAudioFile(e.target.files[0])
      setResult(null)
    }
  }

  const detectWatermark = async () => {
    if (!audioFile) return

    setDetecting(true)
    setResult(null)

    try {
      // Calculate file hash
      const arrayBuffer = await audioFile.arrayBuffer()
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const audioHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      const res = await fetch('/api/v1/watermark/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioHash }),
      })

      if (res.ok) {
        const data = await res.json()
        setResult(data)
      } else {
        const err = await res.json()
        setResult({ error: err.error })
      }
    } catch (err: any) {
      setResult({ error: err.message })
    } finally {
      setDetecting(false)
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Watermark Forensics</h1>
        <p className="text-muted-foreground">Detect and verify audio watermarks</p>
      </div>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Upload Audio</CardTitle>
          <CardDescription>Upload an audio file to detect embedded watermarks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="flex-1"
            />
            <Button
              onClick={detectWatermark}
              disabled={!audioFile || detecting}
            >
              <Search className="mr-2 h-4 w-4" />
              {detecting ? 'Detecting...' : 'Detect'}
            </Button>
          </div>

          {audioFile && (
            <div className="p-3 bg-muted rounded-md text-sm">
              <div className="font-medium">{audioFile.name}</div>
              <div className="text-muted-foreground">
                {(audioFile.size / 1024 / 1024).toFixed(2)} MB
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Detection Results</CardTitle>
          </CardHeader>
          <CardContent>
            {result.error ? (
              <div className="flex items-center gap-2 p-4 bg-destructive/10 text-destructive rounded-md">
                <AlertCircle className="h-5 w-5" />
                <div>{result.error}</div>
              </div>
            ) : result.detected ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-600">Watermark Detected</Badge>
                  <Badge variant="outline">Confidence: {(result.confidence * 100).toFixed(1)}%</Badge>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Contract ID</div>
                    <code className="text-sm">{result.contractId}</code>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Method</div>
                    <div className="text-sm">{result.method}</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-4 bg-muted rounded-md">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <div className="text-muted-foreground">
                  {result.message || 'No watermark detected'}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Xase uses spread-spectrum FFT watermarking to embed imperceptible markers in audio data.
          </p>
          <p>
            The watermark is robust to common transformations (compression, resampling, noise) and can be detected even after the audio has been modified.
          </p>
          <p>
            Detection requires brute-force searching known contract IDs in the frequency domain.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
