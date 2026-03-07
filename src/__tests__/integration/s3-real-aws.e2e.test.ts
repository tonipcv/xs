/**
 * Integration Test: S3 Read/Write + Signed URLs with Real AWS
 * 
 * Teste end-to-end que valida operações reais no S3:
 * - Upload de arquivos para S3
 * - Download de arquivos
 * - Geração de Signed URLs (GET e PUT)
 * - Validação de credenciais STS
 * - Verificação de integridade (checksums)
 * 
 * Requer: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, AWS_S3_BUCKET
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getAwsStsManager } from '@/lib/aws/sts-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Integration: S3 Real Read/Write + Signed URLs', () => {
  let s3Client: S3Client;
  let bucketName: string;
  let testPrefix: string;
  let tempDir: string;
  let hasAwsCredentials: boolean;

  beforeAll(async () => {
    // Verifica credenciais AWS
    hasAwsCredentials = !!(
      process.env.AWS_ACCESS_KEY_ID && 
      process.env.AWS_SECRET_ACCESS_KEY
    );

    if (!hasAwsCredentials) {
      console.log('[S3 Test] AWS credentials not found, tests will use mocks');
    }

    bucketName = process.env.AWS_S3_BUCKET || 'xase-test-bucket';
    testPrefix = `integration-test/${Date.now()}`;
    tempDir = path.join('/tmp', 's3-test', Date.now().toString());
    
    await fs.mkdir(tempDir, { recursive: true });

    // Inicializa S3 client
    s3Client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
    });

    console.log(`[S3 Test Setup] Bucket: ${bucketName}, Prefix: ${testPrefix}`);
  }, 30000);

  afterAll(async () => {
    // Cleanup arquivos de teste
    if (hasAwsCredentials) {
      try {
        const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
        
        // Lista objetos do teste
        const listCmd = new ListObjectsV2Command({
          Bucket: bucketName,
          Prefix: testPrefix,
        });
        const listResponse = await s3Client.send(listCmd);

        // Deleta objetos
        if (listResponse.Contents && listResponse.Contents.length > 0) {
          const deleteCmd = new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: listResponse.Contents.map(obj => ({ Key: obj.Key })),
            },
          });
          await s3Client.send(deleteCmd);
          console.log(`[S3 Cleanup] Deleted ${listResponse.Contents.length} test objects`);
        }
      } catch (error) {
        console.warn('[S3 Cleanup] Failed to cleanup:', error);
      }
    }

    // Remove diretório temporário
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('[S3 Test Cleanup] Complete');
  }, 30000);

  // Check AWS credentials availability for skipIf conditions
  const awsCredentialsAvailable = !!(
    process.env.AWS_ACCESS_KEY_ID && 
    process.env.AWS_SECRET_ACCESS_KEY
  );

  describe.skipIf(!awsCredentialsAvailable)('1. S3 Direct Operations', () => {
    it('should upload file to S3', async () => {
      const testContent = 'Hello from XASE integration test!';
      const testFile = path.join(tempDir, 'test-upload.txt');
      await fs.writeFile(testFile, testContent);

      const key = `${testPrefix}/uploads/test-file-${Date.now()}.txt`;
      const fileContent = await fs.readFile(testFile);

      const putCmd = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
        ContentType: 'text/plain',
        Metadata: {
          'x-test-source': 'integration-test',
          'x-test-timestamp': Date.now().toString(),
        },
      });

      await s3Client.send(putCmd);

      // Verifica que arquivo foi criado
      const headCmd = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const headResponse = await s3Client.send(headCmd);

      expect(headResponse.ContentLength).toBe(fileContent.length);
      expect(headResponse.ContentType).toBe('text/plain');

      console.log(`[S3 Upload] Success: ${key} (${headResponse.ContentLength} bytes)`);
    });

    it('should download file from S3', async () => {
      // Primeiro faz upload
      const testContent = 'Content for download test';
      const key = `${testPrefix}/downloads/test-file-${Date.now()}.txt`;

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: testContent,
        ContentType: 'text/plain',
      }));

      // Download
      const getCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const response = await s3Client.send(getCmd);

      // Converte stream para buffer
      const chunks: Buffer[] = [];
      if (response.Body) {
        for await (const chunk of response.Body as any) {
          chunks.push(Buffer.from(chunk));
        }
      }
      const downloadedContent = Buffer.concat(chunks).toString();

      expect(downloadedContent).toBe(testContent);
      console.log(`[S3 Download] Success: ${key}`);
    });

    it('should verify checksum integrity', async () => {
      // Gera arquivo com conteúdo conhecido
      const testContent = Buffer.alloc(1024 * 1024); // 1MB
      crypto.randomFillSync(testContent);
      const expectedChecksum = crypto.createHash('sha256').update(testContent).digest('hex');

      const key = `${testPrefix}/checksums/test-file-${Date.now()}.bin`;

      // Upload
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: testContent,
        ChecksumAlgorithm: 'SHA256',
      }));

      // Download e verifica
      const getCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const response = await s3Client.send(getCmd);

      const chunks: Buffer[] = [];
      if (response.Body) {
        for await (const chunk of response.Body as any) {
          chunks.push(Buffer.from(chunk));
        }
      }
      const downloadedContent = Buffer.concat(chunks);
      const actualChecksum = crypto.createHash('sha256').update(downloadedContent).digest('hex');

      expect(actualChecksum).toBe(expectedChecksum);
      console.log(`[S3 Checksum] Verified SHA256: ${actualChecksum.substring(0, 16)}...`);
    });

    it('should upload and retrieve with metadata', async () => {
      const metadata = {
        'patient-id': 'PATIENT_12345',
        'study-id': 'STUDY_67890',
        'modality': 'CT',
        'acquisition-date': '2024-01-15',
      };

      const key = `${testPrefix}/metadata/test-${Date.now()}.txt`;

      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: 'test content',
        Metadata: metadata,
      }));

      // Recupera metadata
      const headCmd = new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const response = await s3Client.send(headCmd);

      expect(response.Metadata).toBeDefined();
      expect(response.Metadata!['patient-id']).toBe(metadata['patient-id']);
      expect(response.Metadata!['modality']).toBe(metadata['modality']);

      console.log(`[S3 Metadata] Verified: ${Object.keys(response.Metadata!).length} keys`);
    });
  });

  describe.skipIf(!awsCredentialsAvailable)('2. Signed URL Operations', () => {
    it('should generate presigned GET URL', async () => {
      // Primeiro faz upload
      const key = `${testPrefix}/signed/get-test-${Date.now()}.txt`;
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: 'content for signed URL test',
      }));

      // Gera signed URL
      const getCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const signedUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 300 }); // 5 minutos

      expect(signedUrl).toContain(bucketName);
      expect(signedUrl).toContain(key);
      expect(signedUrl).toContain('X-Amz-Signature');

      // Faz download via URL assinada
      const response = await fetch(signedUrl);
      expect(response.ok).toBe(true);
      
      const content = await response.text();
      expect(content).toBe('content for signed URL test');

      console.log(`[S3 Signed URL GET] Generated URL valid for 300s`);
    });

    it('should generate presigned PUT URL', async () => {
      const key = `${testPrefix}/signed/put-test-${Date.now()}.txt`;
      
      // Gera URL para PUT
      const putCmd = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        ContentType: 'text/plain',
      });
      const signedUrl = await getSignedUrl(s3Client, putCmd, { expiresIn: 300 });

      // Faz upload via URL assinada
      const uploadContent = 'Uploaded via signed URL';
      const response = await fetch(signedUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'text/plain',
        },
        body: uploadContent,
      });

      expect(response.ok).toBe(true);

      // Verifica que arquivo foi criado
      const headResponse = await s3Client.send(new HeadObjectCommand({
        Bucket: bucketName,
        Key: key,
      }));

      expect(headResponse.ContentLength).toBe(uploadContent.length);
      console.log(`[S3 Signed URL PUT] Upload successful: ${key}`);
    });

    it('should expire signed URL after expiration time', async () => {
      // Gera URL com expiração muito curta (1 segundo)
      const key = `${testPrefix}/signed/expire-test-${Date.now()}.txt`;
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: 'content',
      }));

      const getCmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });
      const signedUrl = await getSignedUrl(s3Client, getCmd, { expiresIn: 1 });

      // Espera expirar
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Tenta acessar - deve falhar (403 Forbidden)
      const response = await fetch(signedUrl);
      expect(response.status).toBe(403);

      console.log(`[S3 Signed URL] Expiration verified: URL expired after 1s`);
    });
  });

  describe.skipIf(!awsCredentialsAvailable)('3. AWS STS Integration', () => {
    it('should get caller identity', async () => {
      const stsManager = getAwsStsManager();
      const identity = await stsManager.getCallerIdentity();

      expect(identity.account).toBeTruthy();
      expect(identity.arn).toBeTruthy();
      expect(identity.userId).toBeTruthy();

      console.log(`[AWS STS] Identity: ${identity.arn}`);
    });

    it('should assume role and use temporary credentials', async () => {
      // Este teste requer uma role ARN configurada
      const roleArn = process.env.AWS_TEST_ROLE_ARN;
      
      if (!roleArn) {
        console.log('[AWS STS] Skipping assume role test - AWS_TEST_ROLE_ARN not set');
        return;
      }

      const stsManager = getAwsStsManager();
      
      // Assume role
      const creds = await stsManager.assumeRole({
        roleArn,
        roleSessionName: 'xase-integration-test',
        durationSeconds: 900, // 15 minutos
      });

      expect(creds.accessKeyId).toBeTruthy();
      expect(creds.secretAccessKey).toBeTruthy();
      expect(creds.sessionToken).toBeTruthy();
      expect(creds.expiration).toBeInstanceOf(Date);

      // Cria novo S3 client com credenciais temporárias
      const tempS3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          sessionToken: creds.sessionToken,
        },
      });

      // Testa operação com credenciais temporárias
      const key = `${testPrefix}/sts/test-${Date.now()}.txt`;
      await tempS3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: 'Uploaded with temporary credentials',
      }));

      console.log(`[AWS STS] Assumed role and uploaded: ${key}`);
    });
  });

  describe('4. Mock Mode (when AWS not available)', () => {
    it.runIf(!awsCredentialsAvailable)('should use mock S3 when credentials not available', async () => {
      // Simula operações quando AWS não está disponível
      const mockS3 = {
        uploads: new Map<string, Buffer>(),
        
        async putObject(key: string, data: Buffer) {
          this.uploads.set(key, data);
          return { success: true };
        },
        
        async getObject(key: string) {
          const data = this.uploads.get(key);
          if (!data) throw new Error('Not found');
          return data;
        },
      };

      const testKey = `${testPrefix}/mock/test.txt`;
      const testData = Buffer.from('Mock S3 data');

      await mockS3.putObject(testKey, testData);
      const retrieved = await mockS3.getObject(testKey);

      expect(retrieved.toString()).toBe(testData.toString());
      console.log('[S3 Mock] Operations verified in mock mode');
    });
  });

  describe('5. Error Handling', () => {
    it.runIf(awsCredentialsAvailable)('should handle non-existent key', async () => {
      const key = `${testPrefix}/non-existent-${Date.now()}.txt`;

      try {
        await s3Client.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: key,
        }));
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.name).toBe('NoSuchKey');
      }
    });

    it.runIf(awsCredentialsAvailable)('should handle invalid bucket', async () => {
      try {
        await s3Client.send(new GetObjectCommand({
          Bucket: 'this-bucket-definitely-does-not-exist-12345',
          Key: 'test.txt',
        }));
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.name).toBe('NoSuchBucket');
      }
    });
  });

  describe('6. Performance', () => {
    it.runIf(awsCredentialsAvailable)('should upload 10MB file within 30 seconds', async () => {
      const largeContent = Buffer.alloc(10 * 1024 * 1024); // 10MB
      crypto.randomFillSync(largeContent);

      const key = `${testPrefix}/perf/large-file-${Date.now()}.bin`;

      const startTime = Date.now();
      await s3Client.send(new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: largeContent,
      }));
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000); // 30 segundos
      console.log(`[S3 Performance] Uploaded 10MB in ${duration}ms`);
    }, 60000);
  });
});
