import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      NODE_ENV: 'test',
      NEXTAUTH_URL: 'http://localhost:3000',
      NEXTAUTH_SECRET: 'test-secret',
      EXTERNAL_API_KEY: 'test-external-api-key',
      OPENAI_API_KEY: 'sk-test',
      REDIS_URL: 'redis://localhost:6379',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test?schema=public',
      XASE_KMS_TYPE: 'mock',
      ENCRYPTION_KEY: 'test-encryption-key-32-chars-xxxxx',
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
      // Stripe/Billing (dummy)
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_dummy',
      STRIPE_WEBHOOK_SECRET: 'whsec_dummy',
      STRIPE_INICIANTE_PRODUCT_ID: 'prod_dummy_1',
      STRIPE_PRO_PRODUCT_ID: 'prod_dummy_2',
      // Email/SMTP (disabled)
      EMAIL_FROM_NAME: 'XASE',
      EMAIL_FROM_ADDRESS: 'noreply@example.com',
      SMTP_HOST: 'localhost',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'false',
      SMTP_USER: 'test',
      SMTP_PASS: 'test',
      ENABLE_EMAIL_OTP: 'false',
      DISABLE_EMAIL_OTP: 'true',
      // OAuth (dummy)
      GOOGLE_CLIENT_ID: 'dummy',
      GOOGLE_CLIENT_SECRET: 'dummy',
      GCS_CLIENT_ID: 'dummy',
      GCS_CLIENT_SECRET: 'dummy',
      AZURE_CLIENT_ID: 'dummy',
      AZURE_CLIENT_SECRET: 'dummy',
      AZURE_TENANT_ID: 'dummy',
      AWS_OAUTH_CLIENT_ID: 'dummy',
      AWS_OAUTH_CLIENT_SECRET: 'dummy',
      // AWS/Minio (dummy)
      AWS_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'test',
      AWS_SECRET_ACCESS_KEY: 'test',
      KMS_KEY_ID: 'alias/test',
      MINIO_SERVER_URL: 'http://localhost:9000',
      MINIO_ROOT_USER: 'minioadmin',
      MINIO_ROOT_PASSWORD: 'minioadmin',
      BUCKET_NAME: 'xase',
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: 'true',
      // Federated agent (dummy)
      FEDERATED_JWT_SECRET: 'test-federated-secret',
      FEDERATED_AGENT_URL: 'http://localhost:8080',
      NEXTJS_URL: 'http://localhost:3000',
      // Dev flags
      DEV_ADMIN_TOKEN: 'dev-secret-token',
      // E2E control flags
      E2E_SKIP_AUTH: '1',
    },
  },
})
