/**
 * Dataset Workflow Helper
 * Facilita o fluxo completo: upload → processamento → download controlado
 */

import { prisma } from '@/lib/prisma'

export interface DatasetUploadResult {
  uploadUrl: string
  fileKey: string
  expiresIn: number
  nextStep: {
    description: string
    processUrl: string
    method: string
    body: { fileKey: string }
    headers: { Authorization: string }
  }
}

export interface ProcessingResult {
  success: boolean
  processed?: {
    durationSeconds: number
    sampleRate: number
    codec: string
    channelCount: number
    fileSize: number
    fileHash: string
  }
  error?: string
}

/**
 * Fluxo completo para cliente: upload + processamento automático
 * Uso: await uploadAndProcessAudio(datasetId, file, apiKey)
 */
export async function uploadAndProcessAudio(
  datasetId: string,
  fileName: string,
  fileBuffer: Buffer,
  apiKey: string,
  baseUrl: string = 'http://localhost:3000'
): Promise<{ success: boolean; result?: ProcessingResult; error?: string }> {
  try {
    // 1. Obter URL de upload
    const uploadResponse = await fetch(`${baseUrl}/api/v1/datasets/${datasetId}/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ 
        fileName,
        contentType: 'audio/wav',
      }),
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.json()
      return { success: false, error: error.error || 'Upload URL request failed' }
    }

    const uploadData: DatasetUploadResult = await uploadResponse.json()

    // 2. Fazer upload do arquivo
    const uploadFileResponse = await fetch(uploadData.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'audio/wav',
      },
      body: fileBuffer as unknown as BodyInit, // Buffer é compatível com BodyInit no runtime
    })

    if (!uploadFileResponse.ok) {
      return { success: false, error: 'File upload failed' }
    }

    // 3. Processar arquivo automaticamente
    const processResponse = await fetch(uploadData.nextStep.processUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(uploadData.nextStep.body),
    })

    if (!processResponse.ok) {
      const error = await processResponse.json()
      return { success: false, error: error.error || 'Processing failed' }
    }

    const result: ProcessingResult = await processResponse.json()
    return { success: true, result }
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' }
  }
}

/**
 * Verifica se um dataset está pronto para download (processamento completo)
 */
export async function isDatasetReady(datasetId: string): Promise<{
  ready: boolean
  status: string
  totalHours: number
  numFiles: number
  error?: string
}> {
  try {
    const dataset = await prisma.dataset.findFirst({
      where: { datasetId },
      select: {
        processingStatus: true,
        status: true,
        totalDurationHours: true,
        numRecordings: true,
        processingError: true,
      },
    })

    if (!dataset) {
      return { ready: false, status: 'NOT_FOUND', totalHours: 0, numFiles: 0 }
    }

    return {
      ready: dataset.processingStatus === 'COMPLETED' && dataset.status === 'ACTIVE',
      status: dataset.processingStatus,
      totalHours: dataset.totalDurationHours,
      numFiles: dataset.numRecordings,
      error: dataset.processingError || undefined,
    }
  } catch (error: any) {
    return { 
      ready: false, 
      status: 'ERROR', 
      totalHours: 0, 
      numFiles: 0, 
      error: error.message,
    }
  }
}

/**
 * Testa acesso a um dataset com uma policy
 */
export async function testDatasetAccess(
  datasetId: string,
  policyId: string,
  apiKey: string,
  baseUrl: string = 'http://localhost:3000'
): Promise<{
  allowed: boolean
  downloadUrl?: string
  reason?: string
  hoursAccessed?: number
}> {
  try {
    const response = await fetch(
      `${baseUrl}/api/v1/datasets/${datasetId}/download?policyId=${policyId}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      }
    )

    if (response.ok) {
      const data = await response.json()
      return {
        allowed: true,
        downloadUrl: data.downloadUrl,
        hoursAccessed: data.hoursAccessed,
      }
    } else {
      const error = await response.json()
      return {
        allowed: false,
        reason: error.reason || error.error,
      }
    }
  } catch (error: any) {
    return {
      allowed: false,
      reason: error.message || 'Network error',
    }
  }
}
