#!/bin/bash

# Script para corrigir assinaturas de rotas Next.js v15
# Substitui { params }: { params: { ... } } por context: any

find src/app/api -name "route.ts" -type f | while read file; do
  # Backup
  cp "$file" "$file.bak"
  
  # Fix pattern: export async function METHOD(req, { params }: { params: { X } })
  # Para: export async function METHOD(req, context: any) e adiciona const { params } = context
  
  perl -i -pe '
    if (/^export async function (GET|POST|PUT|PATCH|DELETE)\($/) {
      $_ .= <>;  # read next line
      if (/^\s+req: NextRequest,$/) {
        $_ .= <>;  # read next line
        if (/^\s+\{ params \}: \{ params: \{ (\w+): string[^}]*\} \}$/) {
          my $param = $1;
          $_ = "export async function $1(\n  req: NextRequest,\n  context: any\n) {\n  try {\n    const { params } = context as { params: { $param: string } }\n";
          # Skip the "try {" line that follows
          <>;
        }
      }
    }
  ' "$file" 2>/dev/null || {
    # Se perl falhar, restaura backup
    mv "$file.bak" "$file"
  }
  
  # Remove backup se sucesso
  rm -f "$file.bak"
done

echo "Rotas corrigidas. Executando build..."
npm run build
