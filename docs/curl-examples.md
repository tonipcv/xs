# Xase Voice API - Exemplos cURL (E2E)

Substitua as variáveis:
- HOST=https://localhost:3000
- SUPPLIER_KEY=... (X-API-Key do supplier)
- CLIENT_KEY=... (X-API-Key do client)
- DATASET_ID=será preenchido após criação

## 1) Criar dataset (Supplier)
```
curl -s -X POST "$HOST/api/v1/datasets" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SUPPLIER_KEY" \
  -d '{
    "name": "Demo Voice Dataset",
    "language": "pt-BR",
    "description": "amostra"
  }'
```
Resposta inclui `datasetId`. Exporte:
```
export DATASET_ID=ds_xxx
```

## 2) URL de upload (presigned)
```
curl -s -X POST "$HOST/api/v1/datasets/$DATASET_ID/upload" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SUPPLIER_KEY" \
  -d '{
    "fileName": "rec_001.wav",
    "contentType": "audio/wav"
  }'
```
Resposta contém `uploadUrl` e `key`.

## 3) Fazer upload do arquivo para o S3/MinIO (PUT presigned)
```
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: audio/wav" \
  --data-binary @./rec_001.wav
```

## 4) Disparar webhook (opcional se o MinIO já notifica)
```
curl -s -X POST "$HOST/api/v1/webhooks/minio" \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $MINIO_WEBHOOK_SECRET" \
  -d '{
    "Records": [
      {"s3": {"object": {"key": "datasets/'"$DATASET_ID"'/rec_001.wav"}}}
    ]
  }'
```

## 5) Rodar o worker (em outro terminal)
```
npm run worker:audio
```

## 6) Publicar o dataset (Supplier)
```
curl -s -X POST "$HOST/api/v1/datasets/$DATASET_ID/publish" \
  -H "X-API-Key: $SUPPLIER_KEY"
```

## 7) Criar policy para o client (Supplier)
```
curl -s -X POST "$HOST/api/v1/policies" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $SUPPLIER_KEY" \
  -d '{
    "datasetId": "'$DATASET_ID'",
    "clientTenantId": "<CLIENT_TENANT_ID>",
    "usagePurpose": "training",
    "maxHours": 10,
    "maxDownloads": 100,
    "canBatchDownload": true,
    "pricePerHour": 5,
    "currency": "USD"
  }'
```

## 8) Acessar arquivos (Client)
```
curl -s -X POST "$HOST/api/v1/datasets/$DATASET_ID/access" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $CLIENT_KEY" \
  -d '{
    "files": ["datasets/'"$DATASET_ID"'/rec_001.wav"],
    "hoursRequested": 0.5,
    "requestId": "req_123"
  }'
```

## 9) Listar access logs
```
curl -s -G "$HOST/api/v1/access-logs" \
  -H "X-API-Key: $CLIENT_KEY" \
  --data-urlencode "datasetId=$DATASET_ID" \
  --data-urlencode "limit=50"
```

## 10) Ver ledger e saldo
```
curl -s -G "$HOST/api/v1/ledger" \
  -H "X-API-Key: $CLIENT_KEY" \
  --data-urlencode "limit=50"
```
