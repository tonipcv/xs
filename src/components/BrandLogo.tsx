import React from 'react';

export function BrandLogo() {
  return (
    <div className="flex items-center gap-2">
      <img src="/logo.png" alt="Xase logo" className="h-5 w-5" />
      <span className="font-light tracking-tight text-sm text-[#BFC3C6]">XASE</span>
    </div>
  );
}

export default BrandLogo;
