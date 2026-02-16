#!/usr/bin/env python3
import re
import sys
from pathlib import Path

# Files that have "await params" but missing destructuring
files_to_fix = [
    "src/app/api/v1/datasets/[datasetId]/access-offers/route.ts",
    "src/app/api/v1/datasets/[datasetId]/metadata/route.ts",
    "src/app/api/v1/datasets/[datasetId]/upload/route.ts",
    "src/app/api/v1/datasets/[datasetId]/process/route.ts",
    "src/app/api/v1/datasets/[datasetId]/sources/route.ts",
    "src/app/api/v1/datasets/[datasetId]/sources/[sourceId]/route.ts",
    "src/app/api/v1/policies/[policyId]/validate/route.ts",
    "src/app/api/v1/policies/[policyId]/revoke/route.ts",
    "src/app/api/v1/policies/[policyId]/rewrite-rules/route.ts",
    "src/app/api/v1/leases/[leaseId]/revoke/route.ts",
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

def fix_file(filepath):
    """Add params destructuring after try { in route handlers"""
    path = Path(filepath)
    if not path.exists():
        print(f"⏭️  Não encontrado: {filepath}")
        return False
    
    content = path.read_text()
    lines = content.split('\n')
    new_lines = []
    fixed = False
    
    i = 0
    while i < len(lines):
        line = lines[i]
        new_lines.append(line)
        
        # Look for route handler function signature
        if re.match(r'export async function (GET|POST|PUT|PATCH|DELETE)\(', line):
            # Check if next lines have context: any
            if i + 2 < len(lines) and 'context: any' in lines[i + 1]:
                new_lines.append(lines[i + 1])  # context: any
                new_lines.append(lines[i + 2])  # ) {
                i += 3
                
                # Check for try {
                if i < len(lines) and 'try {' in lines[i]:
                    new_lines.append(lines[i])
                    i += 1
                    
                    # Check if params destructuring is missing
                    if i < len(lines) and 'const { params }' not in lines[i]:
                        # Extract param names from file path
                        param_names = re.findall(r'\[(\w+)\]', filepath)
                        if param_names:
                            if len(param_names) == 1:
                                param_type = f'{{ {param_names[0]}: string }}'
                            else:
                                param_parts = ', '.join([f'{p}: string' for p in param_names])
                                param_type = f'{{ {param_parts} }}'
                            
                            # Add destructuring line
                            new_lines.append(f'    const {{ params }} = context as {{ params: Promise<{param_type}> }}')
                            fixed = True
                    continue
        
        i += 1
    
    if fixed:
        path.write_text('\n'.join(new_lines))
        print(f"✅ Corrigido: {filepath}")
        return True
    else:
        print(f"⏭️  Sem alterações: {filepath}")
        return False

def main():
    print("🔧 Adicionando params destructuring...\n")
    fixed = 0
    for filepath in files_to_fix:
        if fix_file(filepath):
            fixed += 1
    
    print(f"\n✨ Total corrigido: {fixed}/{len(files_to_fix)} arquivos")
    return 0

if __name__ == "__main__":
    sys.exit(main())
