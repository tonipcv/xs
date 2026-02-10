/**
 * XASE CORE - Bundle Manifest Generator
 * 
 * Gera manifest.json para bundles de evidência
 * Manifest é o "contrato criptográfico" do bundle
 * É o que será carimbado pelo QTSP (não o ZIP)
 */

import { hashString, hashObject } from './crypto';

export interface ManifestFile {
  path: string;
  hash: string; // sha256:hex
  size: number;
  type?: string; // 'decision' | 'snapshot' | 'audit' | 'custody' | 'pdf' | 'verify'
}

export interface BundleManifest {
  version: string;
  bundleId: string;
  generatedAt: string;
  tenantId: string;
  
  // Arquivos no bundle
  files: ManifestFile[];
  
  // Metadata
  recordCount: number;
  purpose?: string;
  legalFormat?: string;
  
  // Snapshots incluídos
  includesSnapshots: boolean;
  snapshotTypes?: string[];
  
  // PDF incluído
  includesPdf: boolean;
  pdfReportHash?: string;
  pdfReportLogicalHash?: string;
  
  // Chain of custody
  includesCustodyReport: boolean;
  custodyReportHash?: string;
  
  // Hash do próprio manifest (calculado excluindo este campo)
  manifestHash?: string;
}

/**
 * Calcula hash do manifest (canonical JSON excluindo manifestHash)
 */
export function calculateManifestHash(manifest: BundleManifest): string {
  const { manifestHash, ...manifestWithoutHash } = manifest;
  return hashObject(manifestWithoutHash);
}

/**
 * Adiciona arquivo ao manifest e retorna manifest atualizado
 */
export function addFileToManifest(
  manifest: BundleManifest,
  file: ManifestFile
): BundleManifest {
  return {
    ...manifest,
    files: [...manifest.files, file],
  };
}

/**
 * Finaliza manifest calculando hash final
 */
export function finalizeManifest(manifest: BundleManifest): BundleManifest {
  const manifestHash = calculateManifestHash(manifest);
  return {
    ...manifest,
    manifestHash,
  };
}

/**
 * Valida manifest verificando hashes de todos os arquivos
 */
export async function validateManifest(
  manifest: BundleManifest,
  fileContents: Map<string, Buffer>
): Promise<{
  valid: boolean;
  checks: Record<string, boolean>;
  errors: string[];
}> {
  const checks: Record<string, boolean> = {};
  const errors: string[] = [];

  // 1. Verificar hash do manifest
  const expectedManifestHash = calculateManifestHash(manifest);
  checks.manifestHash = manifest.manifestHash === expectedManifestHash;
  if (!checks.manifestHash) {
    errors.push(
      `Manifest hash mismatch: expected ${expectedManifestHash}, got ${manifest.manifestHash}`
    );
  }

  // 2. Verificar cada arquivo
  for (const file of manifest.files) {
    const content = fileContents.get(file.path);
    if (!content) {
      checks[file.path] = false;
      errors.push(`File not found: ${file.path}`);
      continue;
    }

    // Calcular hash do conteúdo
    const calculatedHash = `sha256:${hashString(content.toString('utf-8'))}`;
    checks[file.path] = calculatedHash === file.hash;

    if (!checks[file.path]) {
      errors.push(
        `Hash mismatch for ${file.path}: expected ${file.hash}, got ${calculatedHash}`
      );
    }
  }

  const valid = Object.values(checks).every((check) => check === true);

  return {
    valid,
    checks,
    errors,
  };
}

/**
 * Gera script de verificação offline atualizado (com manifest)
 */
export function generateEnhancedVerifyScript(): string {
  return `#!/usr/bin/env node
/**
 * XASE CORE - Enhanced Offline Verification Script
 * 
 * Verifica integridade de um bundle de evidência offline
 * Valida manifest primeiro, depois arquivos individuais
 * 
 * Uso: node verify.js
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function hashString(str) {
  return 'sha256:' + crypto.createHash('sha256').update(str).digest('hex');
}

function hashObject(obj) {
  const canonical = JSON.stringify(obj, Object.keys(obj).sort());
  return 'sha256:' + crypto.createHash('sha256').update(canonical).digest('hex');
}

function chainHash(previousHash, currentData) {
  const data = previousHash ? \`\${previousHash}\${currentData}\` : currentData;
  return crypto.createHash('sha256').update(data).digest('hex');
}

async function verifyBundle() {
  console.log('🔍 Xase Bundle Verification\\n');
  console.log('=====================================\\n');

  const checks = {
    manifestExists: false,
    manifestHash: false,
    filesExist: true,
    filesHash: true,
    chainIntegrity: false,
    snapshotsValid: true,
    qtspValid: null,
  };

  const errors = [];

  // 1. Verificar manifest.json
  if (!fs.existsSync('manifest.json')) {
    console.log('❌ manifest.json not found');
    checks.manifestExists = false;
    return { valid: false, checks, errors: ['manifest.json not found'] };
  }

  checks.manifestExists = true;
  const manifest = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
  console.log(\`Bundle ID: \${manifest.bundleId}\`);
  console.log(\`Generated: \${manifest.generatedAt}\`);
  console.log(\`Records: \${manifest.recordCount}\`);
  console.log(\`Files: \${manifest.files.length}\\n\`);

  // 2. Verificar hash do manifest
  const { manifestHash, ...manifestWithoutHash } = manifest;
  const calculatedManifestHash = hashObject(manifestWithoutHash);
  checks.manifestHash = calculatedManifestHash === manifestHash;
  console.log(\`✓ Manifest hash: \${checks.manifestHash ? 'VALID' : 'INVALID'}\`);
  if (!checks.manifestHash) {
    errors.push(\`Manifest hash mismatch: expected \${manifestHash}, got \${calculatedManifestHash}\`);
  }

  // 3. Verificar cada arquivo listado no manifest
  console.log(\`\\n📋 Verifying \${manifest.files.length} files:\\n\`);
  for (const file of manifest.files) {
    const filePath = file.path;
    
    if (!fs.existsSync(filePath)) {
      console.log(\`  ❌ \${filePath}: NOT FOUND\`);
      checks.filesExist = false;
      errors.push(\`File not found: \${filePath}\`);
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const calculatedHash = hashString(content);
    const valid = calculatedHash === file.hash;
    
    console.log(\`  \${valid ? '✓' : '❌'} \${filePath}: \${valid ? 'VALID' : 'INVALID'}\`);
    
    if (!valid) {
      checks.filesHash = false;
      errors.push(\`Hash mismatch for \${filePath}\`);
    }
  }

  // 4. Verificar snapshots (se incluídos)
  if (manifest.includesSnapshots && manifest.snapshotTypes) {
    console.log(\`\\n📸 Snapshots included: \${manifest.snapshotTypes.join(', ')}\`);
    // Snapshots já foram validados no passo 3 (estão em manifest.files)
  }

  // 5. Verificar QTSP (se disponível)
  if (fs.existsSync('signature.json')) {
    const signature = JSON.parse(fs.readFileSync('signature.json', 'utf8'));
    if (signature.qtsp) {
      console.log(\`\\n🔐 QTSP Timestamp found:\`);
      console.log(\`   Provider: \${signature.qtsp.provider}\`);
      console.log(\`   Timestamp: \${signature.qtsp.timestamp}\`);
      console.log(\`   Note: Full QTSP validation requires certificate chain verification\`);
      checks.qtspValid = true; // Estrutura existe, validação completa requer X.509
    }
  }

  // 6. Resultado final
  const allValid = checks.manifestExists && 
                   checks.manifestHash && 
                   checks.filesExist && 
                   checks.filesHash;

  console.log(\`\\n=====================================\`);
  console.log(\`\${allValid ? '✅ BUNDLE IS VALID' : '❌ BUNDLE IS INVALID'}\`);
  console.log(\`=====================================\\n\`);

  if (errors.length > 0) {
    console.log('Errors:');
    errors.forEach(err => console.log(\`  - \${err}\`));
  }

  return { valid: allValid, checks, errors };
}

// Executar
verifyBundle().catch(console.error);
`;
}
