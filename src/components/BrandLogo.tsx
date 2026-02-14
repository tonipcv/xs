"use client";
import React from 'react';

export function BrandLogo({ showText = true }: { showText?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo.png" alt="Xase logo" className="block h-5 w-auto object-contain filter brightness-0" />
      {showText && (
        <span className="font-semibold tracking-tight text-sm text-gray-900 leading-none">XASE</span>
      )}
    </div>
  );
}

export default BrandLogo;
