import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      NODE_ENV: 'test',
      PORT: '3001',
      LOG_LEVEL: 'silent',
      ANALYTICS_PERSISTENCE: 'stdout',
      JWT_SECRET: 'test-jwt-secret-min-32-chars-for-tests',
      JWT_EXPIRES_IN: '7d',
      RECAPTCHA_SECRET_KEY: 'test-recaptcha-key',
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM: 'test@test.com',
      CORS_ORIGIN: 'http://localhost:4200',
      APP_PUBLIC_URL: 'https://app.test.example.com',
      STORAGE_DRIVER: 'supabase',
      LOCAL_STORAGE_DIR: '.storage-test',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key-that-is-long-enough',
      SUPABASE_STORAGE_BUCKET: 'test-bucket',
      CRON_SECRET: 'test-cron-secret-min-32-characters-long',
      ADMIN_JWT_SECRET: 'test-admin-jwt-secret-min-64-chars-for-tests-padding-padding-padding-ok',
      ADMIN_EMAIL: 'admin@test.example.com',
      ADMIN_CORS_ORIGIN: 'http://localhost:4201',
      E2E_ENABLED: 'true',
      E2E_SECRET: 'test-e2e-secret-min-32-characters-long',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
  },
});
