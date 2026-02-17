"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Dataset = {
  datasetId: string;
  name: string;
  description?: string | null;
  status: string;
};

export function DatasetCard({ ds }: { ds: Dataset }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  async function handleDelete() {
    if (!confirm(`Delete dataset "${ds.name}"? This action cannot be undone.`)) return;
    try {
      setDeleting(true);
      const resp = await fetch(`/api/v1/datasets/${ds.datasetId}`, {
        method: "DELETE",
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({} as any));
        throw new Error(data?.error || "Failed to delete dataset");
      }
      window.location.reload();
    } catch (e: any) {
      alert(e?.message || "Failed to delete dataset");
    } finally {
      setDeleting(false);
      setOpen(false);
    }
  }

  function handleCardClick() {
    router.push(`/app/datasets/${ds.datasetId}`);
  }

  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-4 relative cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
    >
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-medium text-gray-900 truncate">{ds.name}</h3>
            {ds.description && (
              <p className="text-[11px] text-gray-600 mt-1 line-clamp-1">{ds.description}</p>
            )}
          </div>
          <span className="ml-2 px-2 py-0.5 rounded border border-gray-200 text-[10px] text-gray-600 whitespace-nowrap">
            {ds.status}
          </span>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Link
              href={`/app/policies`}
              onClick={(e) => e.stopPropagation()}
              className="px-2 py-1 border border-gray-200 rounded-full text-[11px] text-gray-700 hover:bg-gray-50"
            >
              Policies
            </Link>
          </div>
          <div className="relative" ref={menuRef} onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              aria-label="More actions"
              onClick={() => setOpen((v) => !v)}
              className="w-6 h-6 inline-flex items-center justify-center rounded hover:bg-gray-100 text-gray-500"
            >
              <span className="block w-1 h-1 bg-gray-500 rounded-full" />
              <span className="block w-1 h-1 bg-gray-500 rounded-full mx-[2px]" />
              <span className="block w-1 h-1 bg-gray-500 rounded-full" />
            </button>
            {open && (
              <div className="absolute right-0 mt-2 w-36 rounded-md border border-gray-200 bg-white shadow-sm z-10">
                <button
                  type="button"
                  disabled={deleting}
                  onClick={handleDelete}
                  className="w-full text-left px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
