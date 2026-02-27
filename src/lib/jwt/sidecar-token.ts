import * as jose from 'jose';
import { getKeyPair } from './keys';

export interface SidecarTokenPayload {
  sub: string; // Sidecar session ID
  aud: string; // Always 'sidecar'
  iss: string; // Issuer (Brain URL)
  tenant_id: string;
  contract_id: string;
  scopes: string[]; // e.g., ['ingest:read', 'redact:execute', 'metrics:write']
  features: {
    dicom_ocr: boolean;
    fhir_nlp: boolean;
    audio_redaction: boolean;
    prefetch: boolean;
  };
  quotas?: {
    max_bytes_month?: number;
    max_images_month?: number;
    max_audio_minutes_month?: number;
    max_fhir_resources_month?: number;
  };
  exp: number; // Expiration timestamp
  iat: number; // Issued at
}

export async function issueSidecarToken(payload: Omit<SidecarTokenPayload, 'iat' | 'exp' | 'iss' | 'aud'>): Promise<string> {
  const { privateKey } = await getKeyPair();
  
  const now = Math.floor(Date.now() / 1000);
  const ttl = 3600; // 1 hour (short-lived for security)
  
  const fullPayload: SidecarTokenPayload = {
    ...payload,
    aud: 'sidecar',
    iss: process.env.NEXT_PUBLIC_APP_URL || 'https://xase.ai',
    iat: now,
    exp: now + ttl,
  };
  
  const jwt = await new jose.SignJWT(fullPayload as any)
    .setProtectedHeader({ alg: 'RS256', kid: 'xase-brain-key-1' })
    .setIssuedAt(now)
    .setExpirationTime(now + ttl)
    .setAudience('sidecar')
    .setIssuer(fullPayload.iss)
    .setSubject(fullPayload.sub)
    .sign(privateKey);
  
  return jwt;
}

export async function verifySidecarToken(token: string): Promise<SidecarTokenPayload> {
  const { publicKey } = await getKeyPair();
  
  const { payload } = await jose.jwtVerify(token, publicKey, {
    audience: 'sidecar',
    issuer: process.env.NEXT_PUBLIC_APP_URL || 'https://xase.ai',
  });
  
  return payload as unknown as SidecarTokenPayload;
}
