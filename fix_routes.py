#!/usr/bin/env python3
import re
import sys
from pathlib import Path

files_to_fix = [
    "src/app/api/v1/datasets/[datasetId]/stream/route.ts",
    "src/app/api/v1/datasets/[datasetId]/publish/route.ts",
    "src/app/api/v1/datasets/[datasetId]/detail/route.ts",
    "src/app/api/v1/datasets/[datasetId]/download/route.ts",
    "src/app/api/v1/datasets/[datasetId]/route.ts",
    "src/app/api/v1/datasets/[datasetId]/sources/cleanup/route.ts",
    "src/app/api/v1/datasets/[datasetId]/sources/route.ts",
    "src/app/api/v1/datasets/[datasetId]/sources/[sourceId]/route.ts",
    "src/app/api/v1/datasets/[datasetId]/access-offers/route.ts",
    "src/app/api/v1/datasets/[datasetId]/metadata/route.ts",
    "src/app/api/v1/datasets/[datasetId]/upload/route.ts",
    "src/app/api/v1/datasets/[datasetId]/process/route.ts",
    "src/app/api/v1/policies/[policyId]/validate/route.ts",
    "src/app/api/v1/policies/[policyId]/revoke/route.ts",
    "src/app/api/v1/policies/[policyId]/rewrite-rules/route.ts",
    "src/app/api/v1/leases/[leaseId]/revoke/route.ts",
    "src/app/api/v1/access-offers/[offerId]/route.ts",
    "src/app/api/oauth/[provider]/authorize/route.ts",
    "src/app/api/oauth/[provider]/callback/route.ts",
    "src/app/api/xase/api-keys/[keyId]/route.ts",
    "src/app/api/xase/voice/datasets/[datasetId]/route.ts",
    "src/app/api/xase/voice/datasets/[datasetId]/upload/route.ts",
    "src/app/api/xase/voice/policies/[policyId]/test-access/route.ts",
    "src/app/api/xase/bundles/[bundleId]/reprocess/route.ts",
    "src/app/api/xase/bundles/[bundleId]/download/route.ts",
    "src/app/api/cloud-integrations/[id]/scan/route.ts",
    "src/app/api/cloud-integrations/[id]/route.ts",
    "src/app/api/cloud-integrations/[id]/browse/route.ts",
]

def fix_route_file(filepath):
    """Fix Next.js v15 route handler signature"""
    path = Path(filepath)
    if not path.exists():
        print(f"⚠️  Arquivo não encontrado: {filepath}")
        return False
    
    content = path.read_text()
    original = content
    
    # Pattern 1: { params }: { params: { X: string } }
    pattern1 = r'(export async function (GET|POST|PUT|PATCH|DELETE)\(\s*req: NextRequest,\s*)\{ params \}: \{ params: \{ (\w+): string \} \}'
    replacement1 = r'\1context: any'
    content = re.sub(pattern1, replacement1, content)
    
    # Pattern 2: { params }: { params: Promise<{ X: string }> }
    pattern2 = r'(export async function (GET|POST|PUT|PATCH|DELETE)\(\s*req: NextRequest,\s*)\{ params \}: \{ params: Promise<\{ (\w+): string \}> \}'
    replacement2 = r'\1context: any'
    content = re.sub(pattern2, replacement2, content)
    
    if content != original:
        # Add params destructuring after function signature
        # Find all function signatures and add destructuring
        lines = content.split('\n')
        new_lines = []
        i = 0
        while i < len(lines):
            line = lines[i]
            new_lines.append(line)
            
            # Check if this is a route handler with context: any
            if re.match(r'export async function (GET|POST|PUT|PATCH|DELETE)\(', line):
                # Look ahead for context: any
                if i + 2 < len(lines) and 'context: any' in lines[i + 1]:
                    # Add next two lines (context: any and ) {)
                    new_lines.append(lines[i + 1])
                    new_lines.append(lines[i + 2])
                    i += 3
                    
                    # Add try { if present
                    if i < len(lines) and 'try {' in lines[i]:
                        new_lines.append(lines[i])
                        i += 1
                        
                        # Check if params destructuring already exists
                        if i < len(lines) and 'const { params }' not in lines[i]:
                            # Extract param name from file path
                            param_match = re.search(r'\[(\w+)\]', filepath)
                            if param_match:
                                param_name = param_match.group(1)
                                # Check if it's a Promise type
                                if 'Promise<{' in original:
                                    new_lines.append(f'    const {{ params }} = context as {{ params: Promise<{{ {param_name}: string }}> }}')
                                else:
                                    new_lines.append(f'    const {{ params }} = context as {{ params: {{ {param_name}: string }} }}')
                    continue
            
            i += 1
        
        content = '\n'.join(new_lines)
        path.write_text(content)
        print(f"✅ Corrigido: {filepath}")
        return True
    else:
        print(f"⏭️  Sem alterações: {filepath}")
        return False

def main():
    print("🔧 Corrigindo assinaturas de rotas Next.js v15...\n")
    fixed = 0
    for filepath in files_to_fix:
        if fix_route_file(filepath):
            fixed += 1
    
    print(f"\n✨ Total corrigido: {fixed}/{len(files_to_fix)} arquivos")
    return 0

if __name__ == "__main__":
    sys.exit(main())
