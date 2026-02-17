"use client";

import { useState } from "react";

export function DatasetNameEditor({ datasetId, initialName }: { datasetId: string; initialName: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`/api/v1/datasets/${encodeURIComponent(datasetId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update dataset");
      }
      setEditing(false);
    } catch (e: any) {
      setError(e.message || "Failed to update dataset");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-semibold text-gray-900 tracking-tight">{name}</h1>
        <button
          className="px-2 py-1 text-xs border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          className="px-3 py-2 border border-gray-300 rounded-md text-sm w-[420px]"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={saving}
        />
        <button
          className="px-3 py-2 text-sm bg-gray-900 text-white rounded-md disabled:opacity-60"
          onClick={save}
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving..." : "Save"}
        </button>
        <button
          className="px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100"
          onClick={() => { setEditing(false); setName(initialName || name); }}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
