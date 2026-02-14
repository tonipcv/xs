"use client"

import { useState } from 'react'
import { Cloud, Database, HardDrive, Clock, FileAudio, MoreVertical, RefreshCw, Trash2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DataSourceCardProps {
  source: any
  onRemove: () => void
  onResync: () => void
}

export function DataSourceCard({ source, onRemove, onResync }: DataSourceCardProps) {
  const [menuOpen, setMenuOpen] = useState(false)

  const formatBytes = (bytes: number | string) => {
    const num = typeof bytes === 'string' ? parseInt(bytes) : bytes
    if (num === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(num) / Math.log(k))
    return Math.round(num / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
  }

  const formatRelativeTime = (date: string | Date) => {
    const d = new Date(date)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    
    const diffDays = Math.floor(diffHours / 24)
    if (diffDays < 30) return `${diffDays}d ago`
    
    const diffMonths = Math.floor(diffDays / 30)
    return `${diffMonths}mo ago`
  }

  const getProviderIcon = (provider: string) => {
    switch (provider) {
      case 'GCS':
        return '☁️'
      case 'AWS_S3':
        return '📦'
      case 'AZURE_BLOB':
        return '🔷'
      default:
        return '💾'
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3" />
            Active
          </span>
        )
      case 'SYNCING':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Loader2 className="w-3 h-3 animate-spin" />
            Syncing
          </span>
        )
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <AlertCircle className="w-3 h-3" />
            Error
          </span>
        )
      case 'REMOVED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            Removed
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="text-2xl">{getProviderIcon(source.cloudIntegration?.provider)}</div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{source.name}</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              {source.cloudIntegration?.name} ({source.cloudIntegration?.provider})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusBadge(source.status)}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <MoreVertical className="w-4 h-4 text-gray-600" />
            </button>
            {menuOpen && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-8 z-20 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onResync()
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Re-sync
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onRemove()
                    }}
                    className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remove
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Storage Location */}
      <div className="mb-3 px-3 py-2 bg-gray-50 rounded text-sm font-mono text-gray-700 break-all">
        {source.storageLocation}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-3">
        <div>
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
            <FileAudio className="w-3 h-3" />
            Files
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {source.numRecordings?.toLocaleString() || 0}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
            <Clock className="w-3 h-3" />
            Duration
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {Math.round(source.durationHours || 0)}h
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-xs text-gray-600 mb-1">
            <HardDrive className="w-3 h-3" />
            Size
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {formatBytes(source.sizeBytes || 0)}
          </div>
        </div>
      </div>

      {/* Footer */}
      {source.lastSyncedAt && (
        <div className="text-xs text-gray-500 border-t border-gray-100 pt-2">
          Last synced: {formatRelativeTime(source.lastSyncedAt)}
        </div>
      )}
    </div>
  )
}
