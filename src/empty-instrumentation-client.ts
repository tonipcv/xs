// No-op client instrumentation shim for Next.js
// This module is aliased to satisfy imports of 'private-next-instrumentation-client'
export default function noop() {
  // intentionally empty
}
export const register = () => {};
export const onRequest = () => {};
