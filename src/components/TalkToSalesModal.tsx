'use client'

import { useState } from 'react'

export default function TalkToSalesModal({
  triggerClassName = 'px-4 py-2 bg-white/[0.08] hover:bg-white/[0.14] rounded-md text-sm',
  triggerText = 'Talk to Sales',
}: {
  triggerClassName?: string
  triggerText?: string
}) {
  const [open, setOpen] = useState(false)
  const calendlyUrl = 'https://app.cal.eu/xaseai/30min'

  return (
    <>
      <button className={triggerClassName} onClick={() => setOpen(true)}>{triggerText}</button>
      {open && (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl bg-[#0f1115] border border-white/10 rounded-xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 className="text-sm font-medium text-white/80">Talk to Sales</h3>
                <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white">✕</button>
              </div>
              <div className="p-0">
                <iframe
                  title="Book a meeting"
                  src={calendlyUrl}
                  className="w-full"
                  style={{ minHeight: 640 }}
                />
              </div>
              <div className="px-4 py-3 flex items-center justify-between border-t border-white/10 text-xs text-white/60">
                <span>Email: sales@xase.ai</span>
                <a href="mailto:sales@xase.ai" className="px-3 py-1 bg-white/[0.08] rounded hover:bg-white/[0.14] text-white">Contact via email</a>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
