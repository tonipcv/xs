import { authenticator } from 'otplib';

export function generateEmailOtpCode(): string {
  // 6 dígitos, com zeros à esquerda
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function isEmailOtpExpired(expiresAt?: Date | null): boolean {
  if (!expiresAt) return true;
  return new Date() > new Date(expiresAt);
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
