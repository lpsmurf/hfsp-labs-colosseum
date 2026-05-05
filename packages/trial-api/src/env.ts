import { z } from 'zod';

const envSchema = z.object({
  PORT: z.string().default('8787'),
  OPENROUTER_API_KEY: z.string().min(1, 'OPENROUTER_API_KEY is required'),
  TRIAL_MESSAGES_PER_IP_PER_DAY: z.string().default('10').transform(Number),
  TRIAL_DAILY_BUDGET_USD: z.string().default('50').transform(Number),
  TRUST_PROXY: z.string().default('0').transform((v) => v === '1'),
  CORS_ORIGINS: z.string().default('https://clawdrop.live,http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
  // eslint-disable-next-line no-console
  console.error('❌ Environment validation failed:\n', issues);
  process.exit(1);
}

export const env = parsed.data;
