'use client'

import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Play, Pause, Volume2, VolumeX, Download } from 'lucide-react'
import { Slider } from '@/components/ui/slider'

interface DataAsset {
  id: string
  filename: string
  duration: number
  sampleRate: number
  channels: number
  bitDepth: number
  fileSize: number
  snr?: number
  url: string
}

interface AudioPreviewProps {
  segment: DataAsset
  onDownload?: (segmentId: string) => void
}

export function AudioPreview({ segment, onDownload }: AudioPreviewProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime)
    const handleEnded = () => setIsPlaying(false)

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
    } else {
      audio.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = value[0]
    setCurrentTime(value[0])
  }

  const handleVolumeChange = (value: number[]) => {
    const audio = audioRef.current
    if (!audio) return
    const newVolume = value[0]
    audio.volume = newVolume
    setVolume(newVolume)
    setIsMuted(newVolume === 0)
  }

  const toggleMute = () => {
    const audio = audioRef.current
    if (!audio) return
    
    if (isMuted) {
      audio.volume = volume || 0.5
      setIsMuted(false)
    } else {
      audio.volume = 0
      setIsMuted(true)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">{segment.filename}</CardTitle>
            <CardDescription>Segment ID: {segment.id}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline">{formatFileSize(segment.fileSize)}</Badge>
            {segment.snr && (
              <Badge variant="outline">SNR: {segment.snr.toFixed(1)} dB</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Waveform Placeholder */}
        <div className="relative h-24 bg-muted rounded-lg overflow-hidden">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-end gap-0.5 h-full w-full px-2">
              {Array.from({ length: 100 }).map((_, i) => {
                const height = Math.random() * 60 + 20
                const isPlayed = (i / 100) * segment.duration <= currentTime
                return (
                  <div
                    key={i}
                    className={`flex-1 rounded-sm transition-colors ${
                      isPlayed ? 'bg-primary' : 'bg-primary/30'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                )
              })}
            </div>
          </div>
        </div>

        {/* Audio Element */}
        <audio ref={audioRef} src={segment.url} preload="metadata" />

        {/* Controls */}
        <div className="space-y-3">
          {/* Progress Bar */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <Slider
              value={[currentTime]}
              max={segment.duration}
              step={0.1}
              onValueChange={handleSeek}
              className="flex-1"
            />
            <span className="text-sm text-muted-foreground w-12">
              {formatTime(segment.duration)}
            </span>
          </div>

          {/* Play/Pause and Volume */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={togglePlay}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleMute}
                >
                  {isMuted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </Button>
                <Slider
                  value={[isMuted ? 0 : volume]}
                  max={1}
                  step={0.01}
                  onValueChange={handleVolumeChange}
                  className="w-24"
                />
              </div>
            </div>

            {onDownload && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDownload(segment.id)}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            )}
          </div>
        </div>

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div>
            <div className="text-sm text-muted-foreground">Duration</div>
            <div className="font-medium">{formatTime(segment.duration)}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Sample Rate</div>
            <div className="font-medium">{segment.sampleRate} Hz</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Channels</div>
            <div className="font-medium">{segment.channels === 1 ? 'Mono' : 'Stereo'}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">Bit Depth</div>
            <div className="font-medium">{segment.bitDepth} bit</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
