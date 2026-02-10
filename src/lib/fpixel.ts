export const FB_PIXEL_ID = '1338006007492580'

type FbqFunction = {
  (action: 'init', pixelId: string): void;
  (action: 'track', eventName: string, options?: Record<string, unknown>): void;
  push: (args: unknown[]) => void;
  callMethod: (args: unknown[]) => void;
  loaded: boolean;
  version: string;
  queue: unknown[];
}

declare global {
  interface Window {
    fbq: FbqFunction;
    _fbq: FbqFunction;
  }
}

export const pageview = () => {
  window.fbq('track', 'PageView')
}

// https://developers.facebook.com/docs/facebook-pixel/advanced/
export const event = (name: string, options = {}) => {
  window.fbq('track', name, options)
}

export const fbInit = () => {
  window.fbq('init', FB_PIXEL_ID)
} 