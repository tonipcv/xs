import express, { Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { TextDeidentifier } from './text-deidentifier';
import { DICOMDeidentifier } from './dicom-deidentifier';
import { FHIRDeidentifier } from './fhir-deidentifier';
import { AudioDeidentifier } from './audio-deidentifier';
import { HL7Deidentifier } from './hl7-deidentifier';

const app = express();
const upload = multer({ dest: '/tmp/uploads/' });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0',
    uptime: process.uptime()
  });
});

// Metrics endpoint
app.get('/metrics', (req: Request, res: Response) => {
  const memUsage = process.memoryUsage();
  res.json({
    memory: {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB'
    },
    uptime: Math.round(process.uptime()) + ' seconds',
    timestamp: new Date().toISOString()
  });
});

// De-identify text
app.post('/api/v1/deidentify/text', async (req: Request, res: Response) => {
  try {
    const { text, options } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Text content required' });
    }

    const deidentifier = new TextDeidentifier();
    
    // Create temp file
    const tempPath = `/tmp/text_${Date.now()}.txt`;
    fs.writeFileSync(tempPath, text);
    
    const result = await deidentifier.deidentify(tempPath);
    const metrics = deidentifier.getMetrics();
    
    // Cleanup
    fs.unlinkSync(tempPath);
    
    res.json({
      success: true,
      deidentified: result.deidentified,
      metrics: {
        phiDetected: metrics.phiDetected,
        phiRedacted: metrics.phiRedacted,
        redactionRate: metrics.redactionRate
      },
      validation: {
        isValid: result.integrityValid,
        errors: result.validationDetails.errors || []
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// De-identify FHIR
app.post('/api/v1/deidentify/fhir', async (req: Request, res: Response) => {
  try {
    const { resource } = req.body;
    
    if (!resource) {
      return res.status(400).json({ error: 'FHIR resource required' });
    }

    const deidentifier = new FHIRDeidentifier();
    
    const tempPath = `/tmp/fhir_${Date.now()}.json`;
    fs.writeFileSync(tempPath, JSON.stringify(resource));
    
    const result = await deidentifier.deidentify(tempPath);
    const metrics = deidentifier.getMetrics();
    
    fs.unlinkSync(tempPath);
    
    res.json({
      success: true,
      deidentified: JSON.parse(result.deidentified as string),
      metrics: {
        phiDetected: metrics.phiDetected,
        phiRedacted: metrics.phiRedacted,
        redactionRate: metrics.redactionRate
      },
      validation: {
        isValid: result.integrityValid,
        resourceType: (result.validationDetails as any).resourceType
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// De-identify HL7
app.post('/api/v1/deidentify/hl7', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'HL7 message required' });
    }

    const deidentifier = new HL7Deidentifier();
    
    const tempPath = `/tmp/hl7_${Date.now()}.hl7`;
    fs.writeFileSync(tempPath, message);
    
    const result = await deidentifier.deidentify(tempPath);
    const metrics = deidentifier.getMetrics();
    
    fs.unlinkSync(tempPath);
    
    res.json({
      success: true,
      deidentified: result.deidentified,
      metrics: {
        phiDetected: metrics.phiDetected,
        phiRedacted: metrics.phiRedacted,
        redactionRate: metrics.redactionRate
      },
      validation: {
        isValid: result.integrityValid,
        errors: result.validationDetails.errors || []
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload and de-identify file
app.post('/api/v1/deidentify/file', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }

    const fileType = req.body.type || detectFileType(req.file.originalname);
    let deidentifier: any;

    switch (fileType) {
      case 'text':
        deidentifier = new TextDeidentifier();
        break;
      case 'fhir':
        deidentifier = new FHIRDeidentifier();
        break;
      case 'dicom':
        deidentifier = new DICOMDeidentifier();
        break;
      case 'hl7':
        deidentifier = new HL7Deidentifier();
        break;
      case 'audio':
        deidentifier = new AudioDeidentifier();
        break;
      default:
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Unsupported file type' });
    }

    const result = await deidentifier.deidentify(req.file.path);
    const metrics = deidentifier.getMetrics();

    // Cleanup
    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      filename: req.file.originalname,
      deidentified: result.deidentified,
      metrics: {
        phiDetected: metrics.phiDetected,
        phiRedacted: metrics.phiRedacted,
        redactionRate: metrics.redactionRate
      },
      validation: {
        isValid: result.integrityValid
      }
    });
  } catch (error: any) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Batch de-identification
app.post('/api/v1/deidentify/batch', async (req: Request, res: Response) => {
  try {
    const { items, type } = req.body;
    
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Items array required' });
    }

    const results = [];
    let totalPhiDetected = 0;
    let totalPhiRedacted = 0;

    for (const item of items) {
      try {
        let deidentifier: any;
        
        switch (type) {
          case 'text':
            deidentifier = new TextDeidentifier();
            break;
          case 'fhir':
            deidentifier = new FHIRDeidentifier();
            break;
          case 'hl7':
            deidentifier = new HL7Deidentifier();
            break;
          default:
            throw new Error('Unsupported type for batch processing');
        }

        const tempPath = `/tmp/batch_${Date.now()}_${Math.random()}.tmp`;
        fs.writeFileSync(tempPath, typeof item === 'string' ? item : JSON.stringify(item));
        
        const result = await deidentifier.deidentify(tempPath);
        const metrics = deidentifier.getMetrics();
        
        fs.unlinkSync(tempPath);
        
        totalPhiDetected += metrics.phiDetected;
        totalPhiRedacted += metrics.phiRedacted;
        
        results.push({
          success: true,
          deidentified: result.deidentified,
          phiDetected: metrics.phiDetected,
          phiRedacted: metrics.phiRedacted
        });
      } catch (error: any) {
        results.push({
          success: false,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      processed: items.length,
      results,
      summary: {
        totalPhiDetected,
        totalPhiRedacted,
        redactionRate: totalPhiDetected > 0 ? (totalPhiRedacted / totalPhiDetected * 100) : 0
      }
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API documentation
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'XASE De-Identification API',
    version: '2.0',
    endpoints: {
      health: 'GET /health',
      metrics: 'GET /metrics',
      deidentifyText: 'POST /api/v1/deidentify/text',
      deidentifyFHIR: 'POST /api/v1/deidentify/fhir',
      deidentifyHL7: 'POST /api/v1/deidentify/hl7',
      deidentifyFile: 'POST /api/v1/deidentify/file',
      deidentifyBatch: 'POST /api/v1/deidentify/batch'
    },
    documentation: 'See API_DOCUMENTATION.md for details'
  });
});

function detectFileType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.txt') return 'text';
  if (ext === '.json') return 'fhir';
  if (ext === '.hl7') return 'hl7';
  if (ext === '.dcm') return 'dicom';
  if (ext === '.wav' || ext === '.mp3') return 'audio';
  return 'unknown';
}

const PORT = process.env.PORT || 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 XASE De-Identification API Server`);
    console.log(`   Version: 2.0`);
    console.log(`   Port: ${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Metrics: http://localhost:${PORT}/metrics`);
    console.log(`   API Docs: http://localhost:${PORT}/\n`);
  });
}

export default app;
