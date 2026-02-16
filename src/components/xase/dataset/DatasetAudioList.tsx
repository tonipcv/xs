'use client'

import { useState } from 'react'
import { AudioPreview } from './AudioPreview'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'

interface AudioSegment {
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

interface DatasetAudioListProps {
  datasetId: string
  segments: AudioSegment[]
  pageSize?: number
}

export function DatasetAudioList({ datasetId, segments, pageSize = 10 }: DatasetAudioListProps) {
  const [currentPage, setCurrentPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'filename' | 'duration' | 'fileSize'>('filename')

  // Filter segments
  const filteredSegments = segments.filter(seg =>
    seg.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
    seg.id.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Sort segments
  const sortedSegments = [...filteredSegments].sort((a, b) => {
    switch (sortBy) {
      case 'filename':
        return a.filename.localeCompare(b.filename)
      case 'duration':
        return b.duration - a.duration
      case 'fileSize':
        return b.fileSize - a.fileSize
      default:
        return 0
    }
  })

  // Paginate
  const totalPages = Math.ceil(sortedSegments.length / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const paginatedSegments = sortedSegments.slice(startIndex, startIndex + pageSize)

  const handleDownload = async (segmentId: string) => {
    // Trigger download via API
    window.open(`/api/v1/datasets/${datasetId}/segments/${segmentId}/download`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by filename or ID..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              setCurrentPage(1)
            }}
            className="pl-10"
          />
        </div>

        <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="filename">Filename</SelectItem>
            <SelectItem value="duration">Duration</SelectItem>
            <SelectItem value="fileSize">File Size</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Results Count */}
      <div className="text-sm text-muted-foreground">
        Showing {startIndex + 1}-{Math.min(startIndex + pageSize, sortedSegments.length)} of {sortedSegments.length} segments
      </div>

      {/* Audio Previews */}
      <div className="space-y-4">
        {paginatedSegments.map(segment => (
          <AudioPreview
            key={segment.id}
            segment={segment}
            onDownload={handleDownload}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  )
}
