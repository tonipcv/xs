"use client"

import { useParams, useRouter } from 'next/navigation'
import { AppLayout } from '@/components/AppSidebar'
import { Button } from '@/components/ui/button'
import { Playfair_Display } from 'next/font/google'
import Link from 'next/link'

const heading = Playfair_Display({ subsets: ['latin'], weight: ['600', '700'] })

export default function DatasetUploadPage() {
  const router = useRouter()
  const params = useParams<{ datasetId: string }>()
  const datasetId = params?.datasetId as string

  return (
    <AppLayout>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-[900px] mx-auto px-8 py-8 space-y-8">
          <div className="space-y-1.5">
            <h1 className={`${heading.className} text-2xl font-semibold text-gray-900 tracking-tight`}>Connect a Data Provider</h1>
            <p className="text-sm text-gray-600">Dataset ID: <span className="font-mono">{datasetId}</span></p>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
            <p className="text-sm text-gray-700">
              Uploads are disabled. To make this dataset available, connect a cloud data provider and grant
              read-only access to your bucket/prefix or database view. This keeps data in your infrastructure
              and allows governed access via policies and leases.
            </p>

            <div className="flex flex-wrap gap-2 pt-2">
              <Link href="/xase/voice/datasets/new" className="inline-flex items-center px-4 py-2 rounded-md bg-gray-900 hover:bg-gray-800 text-white text-sm">
                Connect Provider
              </Link>
              <Button type="button" onClick={()=>router.push(`/xase/voice/datasets/${datasetId}`)} variant="outline" className="border-gray-300 text-gray-700 hover:bg-gray-50">
                Back to Dataset
              </Button>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  )
}

