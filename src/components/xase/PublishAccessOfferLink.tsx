'use client'

import Link from 'next/link'

export function PublishAccessOfferLink({
  datasetId,
  datasetName,
  datasetLanguage = 'en-US',
  datasetJurisdiction = 'US',
}: {
  datasetId: string
  datasetName: string
  datasetLanguage?: string
  datasetJurisdiction?: string
}) {
  const q = new URLSearchParams({
    datasetId,
    name: datasetName,
    lang: datasetLanguage,
    jur: datasetJurisdiction,
  })
  const href = `/app/marketplace/publish?${q.toString()}`
  return (
    <Link
      href={href}
      className="rounded-full border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 h-9 px-4 py-2 text-sm inline-flex items-center"
    >
      Publish as Access Offer
    </Link>
  )
}
