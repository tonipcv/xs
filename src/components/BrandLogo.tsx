"use client";
import React from 'react';

export function BrandLogo({ showText = true }: { showText?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo.png" alt="Xase logo" className="h-5 w-auto object-contain" />
      {showText && (
        <span className="font-light tracking-tight text-sm text-[#BFC3C6]">XASE</span>
      )}
    </div>
  );
}

export default BrandLogo;
