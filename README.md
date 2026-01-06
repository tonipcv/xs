# Xase Dashboard

AI-powered compliance platform for automated decision-making systems.

## Features

- **Evidence Layer**: Immutable audit trail for AI decisions (EU AI Act compliant)
- **WhatsApp Automation**: AI-powered customer service with OpenAI integration
- **Multi-tenant**: Secure isolation with RBAC
- **Storage**: MinIO/S3 with WORM and legal hold
- **Analytics**: Real-time dashboards and monitoring

## Quick Start

```bash
# Install
npm install

# Setup database
npm run xase:setup
npx prisma db push

# Create tenant
npm run xase:tenant "Company Name" "email@company.com" "Legal Name"

# Start
npm run dev
```

## Documentation

- **[DOCS.md](./DOCS.md)** - Complete documentation index
- **[Setup Guide](./docs/setup/XASE_SETUP_GUIDE.md)** - Installation and configuration
- **[Architecture](./docs/architecture/XASE_COMPLETE_GUIDE.md)** - Technical overview
- **[API Reference](./docs/architecture/EXTERNAL_API.md)** - API documentation

## Tech Stack

- Next.js 15, PostgreSQL, Prisma
- MinIO/S3, AWS KMS, Redis
- OpenAI, Evolution API
- TailwindCSS, shadcn/ui

## License

Proprietary
