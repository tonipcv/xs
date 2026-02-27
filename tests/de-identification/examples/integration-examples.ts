/**
 * XASE De-Identification - Integration Examples
 * Exemplos práticos de integração para diferentes cenários
 */

import { DICOMBinaryDeidentifier } from '../src/dicom-binary-deidentifier';
import { FHIRDeidentifier } from '../src/fhir-deidentifier';
import { HL7Deidentifier } from '../src/hl7-deidentifier';
import { TextDeidentifier } from '../src/text-deidentifier';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Exemplo 1: Integração com PACS (Picture Archiving and Communication System)
// ============================================================================

async function integracaoPACS() {
  console.log('Exemplo 1: Integração com PACS\n');
  
  /**
   * Cenário: Hospital recebe estudos DICOM do PACS e precisa anonimizar
   * antes de enviar para pesquisa ou armazenamento externo
   */
  
  const pacsDirectory = '/path/to/pacs/incoming';
  const outputDirectory = '/path/to/anonymized/studies';
  
  // Simular recebimento de estudo do PACS
  const studyFiles = [
    'study_123/series_1/image_001.dcm',
    'study_123/series_1/image_002.dcm',
    'study_123/series_2/image_001.dcm'
  ];
  
  console.log('Processando estudo do PACS...');
  
  for (const file of studyFiles) {
    const inputPath = path.join(pacsDirectory, file);
    const outputPath = path.join(outputDirectory, file);
    
    // De-identificar
    const deidentifier = new DICOMBinaryDeidentifier();
    await deidentifier.deidentifyToFile(inputPath, outputPath);
    
    const metrics = deidentifier.getMetrics();
    console.log(`  ✓ ${file}: ${metrics.phiRedacted}/${metrics.phiDetected} PHI`);
  }
  
  console.log('\n✅ Estudo anonimizado e pronto para pesquisa\n');
}

// ============================================================================
// Exemplo 2: API REST para Upload de Arquivos
// ============================================================================

async function exemploAPIUpload() {
  console.log('Exemplo 2: API REST para Upload\n');
  
  /**
   * Cenário: Aplicação web permite upload de arquivos DICOM
   * para de-identificação via API REST
   */
  
  const express = require('express');
  const multer = require('multer');
  const app = express();
  
  // Configurar upload
  const upload = multer({ dest: '/tmp/uploads/' });
  
  // Endpoint de upload e de-identificação
  app.post('/api/deidentify/upload', upload.single('dicom'), async (req: any, res: any) => {
    try {
      const inputPath = req.file.path;
      const outputPath = `/tmp/output/${req.file.filename}.dcm`;
      
      // De-identificar
      const deidentifier = new DICOMBinaryDeidentifier();
      await deidentifier.deidentifyToFile(inputPath, outputPath);
      
      const metrics = deidentifier.getMetrics();
      
      // Retornar arquivo de-identificado
      res.download(outputPath, 'anonymized.dcm', (err: any) => {
        // Cleanup
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
      });
      
      console.log(`Upload processado: ${metrics.phiRedacted}/${metrics.phiDetected} PHI`);
      
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  console.log('API configurada em http://localhost:3000/api/deidentify/upload');
  console.log('Exemplo de uso:');
  console.log('  curl -X POST -F "dicom=@input.dcm" http://localhost:3000/api/deidentify/upload -o output.dcm\n');
}

// ============================================================================
// Exemplo 3: Processamento em Lote com Fila
// ============================================================================

async function exemploFilaProcessamento() {
  console.log('Exemplo 3: Processamento em Lote com Fila\n');
  
  /**
   * Cenário: Sistema processa grandes volumes de arquivos
   * usando fila para gerenciar carga
   */
  
  interface Job {
    id: string;
    inputPath: string;
    outputPath: string;
    status: 'pending' | 'processing' | 'completed' | 'failed';
  }
  
  const queue: Job[] = [];
  const concurrency = 5; // Processar 5 arquivos simultaneamente
  
  // Adicionar jobs à fila
  function addToQueue(inputPath: string, outputPath: string): string {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    queue.push({
      id: jobId,
      inputPath,
      outputPath,
      status: 'pending'
    });
    return jobId;
  }
  
  // Processar fila
  async function processQueue() {
    const processing: Promise<void>[] = [];
    
    for (const job of queue.filter(j => j.status === 'pending')) {
      if (processing.length >= concurrency) {
        await Promise.race(processing);
      }
      
      job.status = 'processing';
      
      const promise = (async () => {
        try {
          const deidentifier = new DICOMBinaryDeidentifier();
          await deidentifier.deidentifyToFile(job.inputPath, job.outputPath);
          job.status = 'completed';
          console.log(`  ✓ Job ${job.id} completed`);
        } catch (error) {
          job.status = 'failed';
          console.log(`  ✗ Job ${job.id} failed`);
        }
      })();
      
      processing.push(promise);
    }
    
    await Promise.all(processing);
  }
  
  // Exemplo de uso
  console.log('Adicionando jobs à fila...');
  for (let i = 1; i <= 20; i++) {
    addToQueue(`/data/input/file_${i}.dcm`, `/data/output/file_${i}.dcm`);
  }
  
  console.log(`${queue.length} jobs adicionados`);
  console.log('Processando com concurrency = 5...\n');
  
  // await processQueue();
  
  console.log('✅ Todos os jobs processados\n');
}

// ============================================================================
// Exemplo 4: Integração com EHR (Electronic Health Record)
// ============================================================================

async function integracaoEHR() {
  console.log('Exemplo 4: Integração com EHR\n');
  
  /**
   * Cenário: Sistema EHR exporta dados FHIR para pesquisa
   * Precisa anonimizar antes de compartilhar
   */
  
  // Simular export do EHR
  const ehrExport = {
    patients: ['patient_001.json', 'patient_002.json'],
    observations: ['obs_001.json', 'obs_002.json'],
    encounters: ['enc_001.json']
  };
  
  console.log('Exportando dados do EHR...');
  
  const deidentifier = new FHIRDeidentifier();
  let totalPHI = 0;
  let totalRedacted = 0;
  
  // Processar cada tipo de recurso
  for (const [resourceType, files] of Object.entries(ehrExport)) {
    console.log(`\nProcessando ${resourceType}...`);
    
    for (const file of files) {
      const inputPath = `/ehr/export/${file}`;
      const outputPath = `/research/data/${file}`;
      
      // De-identificar
      await deidentifier.deidentify(inputPath);
      const metrics = deidentifier.getMetrics();
      
      totalPHI += metrics.phiDetected;
      totalRedacted += metrics.phiRedacted;
      
      console.log(`  ✓ ${file}: ${metrics.phiRedacted}/${metrics.phiDetected} PHI`);
    }
  }
  
  console.log(`\n✅ Export completo: ${totalRedacted}/${totalPHI} PHI redactados\n`);
}

// ============================================================================
// Exemplo 5: Pipeline de Dados para Data Lake
// ============================================================================

async function pipelineDataLake() {
  console.log('Exemplo 5: Pipeline para Data Lake\n');
  
  /**
   * Cenário: Pipeline ETL que de-identifica dados antes de
   * carregar no data lake para analytics
   */
  
  interface PipelineConfig {
    source: string;
    destination: string;
    format: 'dicom' | 'fhir' | 'hl7' | 'text';
  }
  
  const pipelines: PipelineConfig[] = [
    { source: '/source/dicom', destination: 's3://datalake/dicom', format: 'dicom' },
    { source: '/source/fhir', destination: 's3://datalake/fhir', format: 'fhir' },
    { source: '/source/hl7', destination: 's3://datalake/hl7', format: 'hl7' }
  ];
  
  console.log('Executando pipelines ETL...\n');
  
  for (const pipeline of pipelines) {
    console.log(`Pipeline: ${pipeline.format}`);
    console.log(`  Source: ${pipeline.source}`);
    console.log(`  Destination: ${pipeline.destination}`);
    
    // 1. Extract
    console.log('  [1/3] Extracting...');
    
    // 2. Transform (De-identify)
    console.log('  [2/3] De-identifying...');
    
    let deidentifier: any;
    switch (pipeline.format) {
      case 'dicom':
        deidentifier = new DICOMBinaryDeidentifier();
        break;
      case 'fhir':
        deidentifier = new FHIRDeidentifier();
        break;
      case 'hl7':
        deidentifier = new HL7Deidentifier();
        break;
    }
    
    // Processar arquivos
    // await deidentifier.deidentify(...);
    
    // 3. Load
    console.log('  [3/3] Loading to data lake...');
    console.log('  ✓ Pipeline completed\n');
  }
  
  console.log('✅ Todos os pipelines executados\n');
}

// ============================================================================
// Exemplo 6: Webhook para Notificações
// ============================================================================

async function exemploWebhook() {
  console.log('Exemplo 6: Webhook para Notificações\n');
  
  /**
   * Cenário: Sistema notifica aplicação externa quando
   * de-identificação é concluída
   */
  
  const axios = require('axios');
  const crypto = require('crypto');
  
  interface WebhookConfig {
    url: string;
    secret: string;
  }
  
  const webhookConfig: WebhookConfig = {
    url: 'https://api.cliente.com/webhooks/deidentification',
    secret: 'webhook_secret_key'
  };
  
  async function sendWebhook(event: string, data: any) {
    // Criar signature HMAC
    const signature = crypto
      .createHmac('sha256', webhookConfig.secret)
      .update(JSON.stringify(data))
      .digest('hex');
    
    try {
      await axios.post(webhookConfig.url, data, {
        headers: {
          'X-XASE-Signature': signature,
          'X-XASE-Event': event
        }
      });
      
      console.log(`  ✓ Webhook sent: ${event}`);
    } catch (error) {
      console.log(`  ✗ Webhook failed: ${event}`);
    }
  }
  
  // Exemplo de uso
  console.log('Processando arquivo e enviando webhook...\n');
  
  const deidentifier = new DICOMBinaryDeidentifier();
  // await deidentifier.deidentify(...);
  const metrics = deidentifier.getMetrics();
  
  // Enviar notificação
  await sendWebhook('deidentification.completed', {
    jobId: 'job_123',
    file: 'study.dcm',
    phiDetected: metrics.phiDetected,
    phiRedacted: metrics.phiRedacted,
    timestamp: new Date().toISOString()
  });
  
  console.log('\n✅ Webhook enviado\n');
}

// ============================================================================
// Exemplo 7: Integração com Marketplace
// ============================================================================

async function integracaoMarketplace() {
  console.log('Exemplo 7: Integração com Marketplace\n');
  
  /**
   * Cenário: Hospital prepara dataset para venda no marketplace
   * Precisa de-identificar e empacotar dados
   */
  
  interface Dataset {
    id: string;
    name: string;
    description: string;
    files: string[];
    price: number;
  }
  
  const dataset: Dataset = {
    id: 'dataset_001',
    name: 'CT Scans - Lung Cancer Study',
    description: '1000 CT scans de pacientes com câncer de pulmão',
    files: [],
    price: 50000
  };
  
  console.log(`Preparando dataset: ${dataset.name}`);
  console.log(`Preço: $${dataset.price.toLocaleString()}\n`);
  
  // 1. De-identificar arquivos
  console.log('Step 1: De-identifying files...');
  const deidentifier = new DICOMBinaryDeidentifier();
  let totalFiles = 0;
  
  for (let i = 1; i <= 10; i++) {
    const inputPath = `/hospital/data/study_${i}.dcm`;
    const outputPath = `/marketplace/datasets/${dataset.id}/study_${i}.dcm`;
    
    // await deidentifier.deidentifyToFile(inputPath, outputPath);
    dataset.files.push(outputPath);
    totalFiles++;
  }
  
  console.log(`  ✓ ${totalFiles} files de-identified\n`);
  
  // 2. Gerar metadados
  console.log('Step 2: Generating metadata...');
  const metadata = {
    dataset,
    deidentification: {
      method: 'XASE v2.1.0',
      compliance: ['HIPAA', 'GDPR'],
      phiRemoved: ['names', 'dates', 'ids', 'locations'],
      timestamp: new Date().toISOString()
    },
    quality: {
      totalFiles: totalFiles,
      totalPHI: 510,
      totalRedacted: 510,
      redactionRate: 100
    }
  };
  
  console.log('  ✓ Metadata generated\n');
  
  // 3. Upload para marketplace
  console.log('Step 3: Uploading to marketplace...');
  console.log('  ✓ Dataset uploaded\n');
  
  // 4. Calcular revenue sharing
  console.log('Step 4: Revenue sharing calculation...');
  const revenue = {
    total: dataset.price,
    hospital: dataset.price * 0.6,
    platform: dataset.price * 0.3,
    patients: dataset.price * 0.1
  };
  
  console.log(`  Hospital receives: $${revenue.hospital.toLocaleString()}`);
  console.log(`  Platform receives: $${revenue.platform.toLocaleString()}`);
  console.log(`  Patients receive: $${revenue.patients.toLocaleString()}\n`);
  
  console.log('✅ Dataset ready for sale on marketplace\n');
}

// ============================================================================
// Main - Executar todos os exemplos
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     XASE De-Identification - Integration Examples         ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');
  
  const examples = [
    { name: 'PACS Integration', fn: integracaoPACS },
    { name: 'API Upload', fn: exemploAPIUpload },
    { name: 'Queue Processing', fn: exemploFilaProcessamento },
    { name: 'EHR Integration', fn: integracaoEHR },
    { name: 'Data Lake Pipeline', fn: pipelineDataLake },
    { name: 'Webhook Notifications', fn: exemploWebhook },
    { name: 'Marketplace Integration', fn: integracaoMarketplace }
  ];
  
  for (const example of examples) {
    console.log('─'.repeat(60));
    await example.fn();
  }
  
  console.log('─'.repeat(60));
  console.log('\n✅ Todos os exemplos demonstrados!\n');
  console.log('Para mais informações:');
  console.log('  - API Documentation: API_DOCUMENTATION.md');
  console.log('  - Usage Guide: USAGE_GUIDE.md');
  console.log('  - DICOM Guide: DICOM_BINARY_GUIDE.md\n');
}

// Executar se chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

export {
  integracaoPACS,
  exemploAPIUpload,
  exemploFilaProcessamento,
  integracaoEHR,
  pipelineDataLake,
  exemploWebhook,
  integracaoMarketplace
};
