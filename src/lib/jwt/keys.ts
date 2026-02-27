import * as jose from 'jose';
import * as crypto from 'crypto';

// Generate or load RSA key pair for JWT signing
// In production, store private key in secure vault (AWS Secrets Manager, etc.)
let cachedKeyPair: { publicKey: jose.KeyLike; privateKey: jose.KeyLike } | null = null;

export async function getKeyPair() {
  if (cachedKeyPair) {
    return cachedKeyPair;
  }

  // Check if keys exist in env (base64-encoded PEM)
  const privateKeyPem = process.env.JWT_PRIVATE_KEY;
  const publicKeyPem = process.env.JWT_PUBLIC_KEY;

  if (privateKeyPem && publicKeyPem) {
    // Load from env
    const privateKey = await jose.importPKCS8(
      Buffer.from(privateKeyPem, 'base64').toString('utf-8'),
      'RS256'
    );
    const publicKey = await jose.importSPKI(
      Buffer.from(publicKeyPem, 'base64').toString('utf-8'),
      'RS256'
    );

    cachedKeyPair = { publicKey, privateKey };
    return cachedKeyPair;
  }

  // Generate ephemeral keys (dev only - not persisted across restarts)
  console.warn('[JWT] No JWT_PRIVATE_KEY/JWT_PUBLIC_KEY found, generating ephemeral keys (dev only)');
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const importedPrivate = await jose.importPKCS8(privateKey, 'RS256');
  const importedPublic = await jose.importSPKI(publicKey, 'RS256');

  cachedKeyPair = { publicKey: importedPublic, privateKey: importedPrivate };
  return cachedKeyPair;
}

export async function getPublicJWK() {
  const { publicKey } = await getKeyPair();
  const jwk = await jose.exportJWK(publicKey);
  
  return {
    ...jwk,
    alg: 'RS256',
    use: 'sig',
    kid: 'xase-brain-key-1', // Key ID for rotation
  };
}
