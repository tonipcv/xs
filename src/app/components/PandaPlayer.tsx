'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    pandascripttag: (() => void)[]
    PandaPlayer: new (videoId: string, options: {
      onReady: () => void
      library_id: string
      video_id: string
      fetchPriority: string
      defaultStyle: boolean
    }) => void
  }
}

interface PandaPlayerProps {
  videoId: string
}

export function PandaPlayer({ videoId }: PandaPlayerProps) {
  useEffect(() => {
    // Adiciona o script do Panda Video se ainda não existir
    if (!document.querySelector('script[src^="https://player.pandavideo.com.br/api.v2.js"]')) {
      const script = document.createElement('script')
      script.src = 'https://player.pandavideo.com.br/api.v2.js?nowprocket'
      script.async = true
      document.head.appendChild(script)

      script.onload = initializePlayer
    } else {
      initializePlayer()
    }

    function initializePlayer() {
      window.pandascripttag = window.pandascripttag || []
      window.pandascripttag.push(function() {
        new window.PandaPlayer(videoId, {
          onReady() {
            // Player está pronto
          },
          library_id: 'vz-7b6cf9e4-8bf',
          video_id: videoId,
          fetchPriority: "high",
          defaultStyle: true
        })
      })
    }
  }, [videoId])

  return (
    <div id={videoId} className="w-full aspect-video" />
  )
} 