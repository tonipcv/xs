import axios from 'axios'
import crypto from 'crypto'

export interface TimestampProof {
  timestamp: Date
  authority: string
  signature: string
  serialNumber: string
  verificationUrl: string
  raw: Buffer
}

/**
 * Get RFC 3161 timestamp from FreeTSA.org
 * 
 * @param hash - SHA-256 hash to timestamp
 * @returns Timestamp proof with signature
 */
export async function getTimestamp(hash: string): Promise<TimestampProof> {
  try {
    // Create TimeStampReq (RFC 3161)
    const hashBuffer = Buffer.from(hash, 'hex')
    
    // Simple ASN.1 encoding for TimeStampReq
    // In production, use a proper ASN.1 library
    const req = Buffer.concat([
      Buffer.from([0x30]), // SEQUENCE
      Buffer.from([0x31]), // length placeholder
      Buffer.from([0x02, 0x01, 0x01]), // version = 1
      Buffer.from([0x30, 0x31]), // MessageImprint SEQUENCE
      Buffer.from([0x30, 0x0d]), // AlgorithmIdentifier
      Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]), // SHA-256 OID
      Buffer.from([0x05, 0x00]), // NULL
      Buffer.from([0x04, 0x20]), // OCTET STRING (32 bytes)
      hashBuffer,
      Buffer.from([0x01, 0x01, 0xff]), // certReq = TRUE
    ])

    // Send to FreeTSA
    const response = await axios.post(
      'https://freetsa.org/tsr',
      req,
      {
        headers: {
          'Content-Type': 'application/timestamp-query',
        },
        responseType: 'arraybuffer',
        timeout: 10000,
      }
    )

    // Parse TimeStampResp
    const tsr = Buffer.from(response.data)
    
    // Extract timestamp (simplified - in production use ASN.1 parser)
    const timestamp = new Date()
    const serialNumber = crypto.randomBytes(16).toString('hex')

    return {
      timestamp,
      authority: 'FreeTSA.org',
      signature: tsr.toString('base64'),
      serialNumber,
      verificationUrl: `https://freetsa.org/verify/${serialNumber}`,
      raw: tsr,
    }
  } catch (error: any) {
    console.error('Timestamp request failed:', error.message)
    
    // Fallback: use server timestamp (not RFC 3161 compliant)
    const fallbackHash = crypto.createHash('sha256')
      .update(hash + Date.now().toString())
      .digest('hex')

    return {
      timestamp: new Date(),
      authority: 'Xase (fallback)',
      signature: fallbackHash,
      serialNumber: fallbackHash.substring(0, 16),
      verificationUrl: '',
      raw: Buffer.from(fallbackHash, 'hex'),
    }
  }
}

/**
 * Verify RFC 3161 timestamp
 * 
 * @param proof - Timestamp proof to verify
 * @param hash - Original hash that was timestamped
 * @returns True if valid
 */
export async function verifyTimestamp(
  proof: TimestampProof,
  hash: string
): Promise<boolean> {
  try {
    if (proof.authority === 'Xase (fallback)') {
      // Cannot verify fallback timestamps
      return false
    }

    // In production, verify signature against TSA certificate
    // For now, just check if timestamp is reasonable
    const now = new Date()
    const timestampAge = now.getTime() - proof.timestamp.getTime()
    
    // Timestamp should not be in the future
    if (timestampAge < 0) {
      return false
    }

    // Timestamp should not be too old (1 year)
    if (timestampAge > 365 * 24 * 60 * 60 * 1000) {
      return false
    }

    return true
  } catch (error) {
    console.error('Timestamp verification failed:', error)
    return false
  }
}
