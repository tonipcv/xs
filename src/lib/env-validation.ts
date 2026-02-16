import { z } from 'zod';

/**
 * Environment Variable Validation Schema
 * 
 * This validates all required environment variables at startup.
 * If any required variable is missing or invalid, the application will fail fast.
 */

const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // NextAuth
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  
  // Email (optional in development)
  EMAIL_FROM_NAME: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().optional(),
  SMTP_SECURE: z.string().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  
  // OAuth Providers (optional)
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  
  // Stripe (required for production)
  STRIPE_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  
  // AWS (optional)
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  
  // Xase Specific
  XASE_CRON_SECRET: z.string().min(16, 'XASE_CRON_SECRET must be at least 16 characters').optional(),
  XASE_KMS_TYPE: z.enum(['mock', 'aws']).default('mock'),
  ENCRYPTION_KEY: z.string().min(16, 'ENCRYPTION_KEY must be at least 16 characters').optional(),
  
  // Federated Agent
  FEDERATED_JWT_SECRET: z.string().min(32, 'FEDERATED_JWT_SECRET must be at least 32 characters').optional(),
  FEDERATED_AGENT_URL: z.string().url().optional(),
  
  // OpenAI
  OPENAI_API_KEY: z.string().optional(),
});

/**
 * Production-specific validation
 * These variables are required in production but optional in development
 */
const productionEnvSchema = envSchema.extend({
  STRIPE_SECRET_KEY: z.string().min(1, 'STRIPE_SECRET_KEY is required in production'),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1, 'STRIPE_PUBLISHABLE_KEY is required in production'),
  EMAIL_FROM_ADDRESS: z.string().email('Valid email required in production'),
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required in production'),
  SMTP_USER: z.string().min(1, 'SMTP_USER is required in production'),
  SMTP_PASS: z.string().min(1, 'SMTP_PASS is required in production'),
  ENCRYPTION_KEY: z.string().min(32, 'ENCRYPTION_KEY must be at least 32 characters in production'),
});

/**
 * Validate environment variables
 * Call this at application startup
 */
export function validateEnv() {
  const isProduction = process.env.NODE_ENV === 'production';
  const schema = isProduction ? productionEnvSchema : envSchema;
  
  try {
    const validated = schema.parse(process.env);
    
    // Additional security checks
    if (isProduction) {
      // Ensure we're not using test/dev keys in production
      if (validated.STRIPE_SECRET_KEY?.startsWith('sk_test_')) {
        throw new Error('Cannot use Stripe test keys in production');
      }
      
      if (validated.NEXTAUTH_SECRET === 'c6a43b8c0edf716a02d0a0b8f5e05d9a8b4e7f9d2c1b0a5e8d7f4a1b0c3e6d9') {
        throw new Error('Cannot use default NEXTAUTH_SECRET in production');
      }
      
      if (validated.XASE_KMS_TYPE === 'mock') {
        console.warn('⚠️  WARNING: Using mock KMS in production. This is not recommended.');
      }
    }
    
    console.log('✅ Environment variables validated successfully');
    return validated;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Environment validation failed:');
      error.errors.forEach((err) => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('❌ Environment validation failed:', error);
    }
    
    // Fail fast - don't start the application with invalid config
    process.exit(1);
  }
}

/**
 * Get a validated environment variable
 * Throws if the variable is not set
 */
export function getEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get an optional environment variable
 * Returns undefined if not set
 */
export function getOptionalEnv(key: string): string | undefined {
  return process.env[key];
}

/**
 * Type-safe environment variables
 */
export type ValidatedEnv = z.infer<typeof envSchema>;
