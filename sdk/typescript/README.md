# XASE Sheets SDK - TypeScript/JavaScript

Official TypeScript/JavaScript SDK for XASE Sheets - Secure Data Marketplace Platform.

## Installation

```bash
npm install @xase/sheets-sdk
# or
yarn add @xase/sheets-sdk
# or
pnpm add @xase/sheets-sdk
```

## Quick Start

```typescript
import XaseClient from '@xase/sheets-sdk';

// Initialize client
const client = new XaseClient({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.xase.ai', // optional
});

// List datasets
const { datasets } = await client.listDatasets();
console.log(datasets);

// Create a lease
const lease = await client.createLease({
  datasetId: 'dataset-id',
  duration: 3600, // 1 hour
  purpose: 'AI model training',
});

console.log('Access token:', lease.accessToken);
```

## Features

- ✅ Full TypeScript support with type definitions
- ✅ Promise-based async/await API
- ✅ Automatic request retries
- ✅ WebSocket support for real-time notifications
- ✅ Comprehensive error handling
- ✅ ESM and CommonJS support

## API Reference

### Client Initialization

```typescript
const client = new XaseClient({
  apiKey: string;        // Required: Your API key
  baseUrl?: string;      // Optional: API base URL (default: https://api.xase.ai)
  timeout?: number;      // Optional: Request timeout in ms (default: 30000)
});
```

### Datasets

#### List Datasets

```typescript
const { datasets, total } = await client.listDatasets({
  page: 1,
  limit: 20,
  dataType: 'AUDIO', // optional filter
});
```

#### Get Dataset

```typescript
const dataset = await client.getDataset('dataset-id');
```

#### Create Dataset

```typescript
const dataset = await client.createDataset({
  name: 'My Dataset',
  description: 'Audio dataset for speech recognition',
  dataType: 'AUDIO',
  tags: ['speech', 'english'],
});
```

#### Update Dataset

```typescript
const updated = await client.updateDataset('dataset-id', {
  description: 'Updated description',
});
```

#### Delete Dataset

```typescript
await client.deleteDataset('dataset-id');
```

### Leases

#### Create Lease

```typescript
const lease = await client.createLease({
  datasetId: 'dataset-id',
  duration: 3600, // seconds
  purpose: 'Model training',
});
```

#### Get Lease

```typescript
const lease = await client.getLease('lease-id');
```

#### List Leases

```typescript
const { leases, total } = await client.listLeases({
  page: 1,
  limit: 20,
  status: 'ACTIVE',
});
```

#### Revoke Lease

```typescript
await client.revokeLease('lease-id');
```

#### Renew Lease

```typescript
const renewed = await client.renewLease('lease-id', 3600);
```

### Policies

#### Create Policy

```typescript
const policy = await client.createPolicy({
  name: 'Strict Access Policy',
  datasetId: 'dataset-id',
  rules: {
    maxDuration: 7200,
    watermarkRequired: true,
    allowedPurposes: ['research', 'training'],
  },
});
```

#### Get Policy

```typescript
const policy = await client.getPolicy('policy-id');
```

#### List Policies

```typescript
const { policies } = await client.listPolicies({
  datasetId: 'dataset-id',
  active: true,
});
```

#### Update Policy

```typescript
const updated = await client.updatePolicy('policy-id', {
  active: false,
});
```

#### Delete Policy

```typescript
await client.deletePolicy('policy-id');
```

### Usage Tracking

#### Record Usage

```typescript
await client.recordUsage({
  leaseId: 'lease-id',
  bytesTransferred: 1024000,
  recordsAccessed: 100,
});
```

#### Get Usage

```typescript
const usage = await client.getUsage({
  startDate: '2024-01-01',
  endDate: '2024-01-31',
});
```

### Marketplace

#### List Offers

```typescript
const offers = await client.listOffers({
  page: 1,
  limit: 20,
  dataType: 'AUDIO',
});
```

#### Get Offer

```typescript
const offer = await client.getOffer('offer-id');
```

#### Request Access

```typescript
const request = await client.requestAccess({
  offerId: 'offer-id',
  purpose: 'Research project on speech recognition',
});
```

#### Search Marketplace

```typescript
const results = await client.searchMarketplace('speech recognition', {
  dataType: 'AUDIO',
  minSize: 1000000,
});
```

### Webhooks

#### Create Webhook

```typescript
const webhook = await client.createWebhook({
  url: 'https://your-domain.com/webhook',
  events: ['lease.created', 'lease.expired'],
  secret: 'your-webhook-secret',
});
```

#### List Webhooks

```typescript
const webhooks = await client.listWebhooks();
```

#### Delete Webhook

```typescript
await client.deleteWebhook('webhook-id');
```

### Real-time Notifications

```typescript
const ws = client.connectNotifications((notification) => {
  console.log('Received notification:', notification);
  
  switch (notification.type) {
    case 'lease.expiring':
      console.log('Lease expiring soon:', notification.data);
      break;
    case 'usage.threshold':
      console.log('Usage threshold exceeded:', notification.data);
      break;
  }
});

// Close connection when done
ws.close();
```

### Health Check

```typescript
const health = await client.health();
console.log('API Status:', health.status);
```

## Error Handling

```typescript
try {
  const dataset = await client.getDataset('invalid-id');
} catch (error) {
  if (error.response) {
    // API error response
    console.error('Status:', error.response.status);
    console.error('Error:', error.response.data.error);
  } else {
    // Network or other error
    console.error('Error:', error.message);
  }
}
```

## TypeScript Support

The SDK is written in TypeScript and includes full type definitions:

```typescript
import XaseClient, { Dataset, Lease, Policy } from '@xase/sheets-sdk';

const client = new XaseClient({ apiKey: 'key' });

// Full type inference
const dataset: Dataset = await client.getDataset('id');
const lease: Lease = await client.createLease({ datasetId: 'id' });
```

## Examples

### Complete Workflow

```typescript
import XaseClient from '@xase/sheets-sdk';

async function main() {
  const client = new XaseClient({
    apiKey: process.env.XASE_API_KEY!,
  });

  // 1. Create a dataset
  const dataset = await client.createDataset({
    name: 'Speech Dataset',
    dataType: 'AUDIO',
    description: 'English speech samples',
  });

  // 2. Create access policy
  const policy = await client.createPolicy({
    name: 'Research Access',
    datasetId: dataset.id,
    rules: {
      maxDuration: 7200,
      watermarkRequired: true,
      allowedPurposes: ['research'],
    },
  });

  // 3. Create lease
  const lease = await client.createLease({
    datasetId: dataset.id,
    duration: 3600,
    purpose: 'Speech recognition research',
  });

  console.log('Access token:', lease.accessToken);

  // 4. Record usage
  await client.recordUsage({
    leaseId: lease.id,
    bytesTransferred: 5000000,
    recordsAccessed: 500,
  });

  // 5. Get usage stats
  const usage = await client.getUsage();
  console.log('Total usage:', usage);
}

main().catch(console.error);
```

### Real-time Monitoring

```typescript
import XaseClient from '@xase/sheets-sdk';

const client = new XaseClient({
  apiKey: process.env.XASE_API_KEY!,
});

// Connect to real-time notifications
const ws = client.connectNotifications((notification) => {
  console.log(`[${notification.type}]`, notification.message);
  
  if (notification.type === 'lease.expiring') {
    // Automatically renew lease
    client.renewLease(notification.data.leaseId, 3600)
      .then(() => console.log('Lease renewed'))
      .catch(console.error);
  }
});

// Handle WebSocket events
ws.on('open', () => console.log('Connected to notifications'));
ws.on('close', () => console.log('Disconnected from notifications'));
ws.on('error', (error) => console.error('WebSocket error:', error));
```

## Environment Variables

```bash
# .env
XASE_API_KEY=your-api-key
XASE_BASE_URL=https://api.xase.ai
```

## Browser Support

The SDK works in both Node.js and browser environments. For browsers, use a bundler like webpack or vite.

## License

MIT

## Support

- Documentation: https://docs.xase.ai
- Email: support@xase.ai
- GitHub: https://github.com/xaseai/xase-sheets

## Contributing

Contributions are welcome! Please read our contributing guidelines.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.
