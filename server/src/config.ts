export type ProviderType = 'anthropic' | 'openai' | 'openrouter' | 'custom';

export interface TierConfig {
  provider: ProviderType;
  model: string;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
}

export type ChatMode = 'openclaw' | 'llm';

export interface AppConfig {
  port: number;
  jwtSecret: string;
  chatMode: ChatMode;
  openclaw: {
    url: string;
    token: string;
  };
  llm: {
    defaults: {
      provider: ProviderType;
      apiKey: string;
      baseUrl?: string;
    };
    tiers: {
      chat: TierConfig;
      reasoning: TierConfig;
      quick: TierConfig;
    };
  };
}

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

function resolveBaseUrl(provider: ProviderType, explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (provider === 'openrouter') return OPENROUTER_BASE_URL;
  return undefined;
}

function tierFromEnv(
  tier: string,
  defaults: { provider: ProviderType; apiKey: string; baseUrl?: string },
): TierConfig {
  const prefix = `LLM_${tier}`;
  const provider = (process.env[`${prefix}_PROVIDER`] as ProviderType) || defaults.provider;
  const apiKey = process.env[`${prefix}_API_KEY`] || defaults.apiKey;
  const model = process.env[`${prefix}_MODEL`] || '';
  const baseUrl = resolveBaseUrl(provider, process.env[`${prefix}_BASE_URL`] || defaults.baseUrl);

  const headers: Record<string, string> = {};
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://orion-cockpit.local';
    headers['X-Title'] = 'Orion Cockpit';
  }

  return { provider, model, apiKey, baseUrl, headers };
}

function loadConfig(): AppConfig {
  const defaultProvider = (process.env.LLM_PROVIDER as ProviderType) || 'anthropic';
  const defaultApiKey = process.env.LLM_API_KEY || '';
  const defaultBaseUrl = resolveBaseUrl(defaultProvider, process.env.LLM_BASE_URL);

  const defaults = { provider: defaultProvider, apiKey: defaultApiKey, baseUrl: defaultBaseUrl };

  return {
    port: parseInt(process.env.PORT || '3001', 10),
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
    chatMode: (process.env.CHAT_MODE as ChatMode) || 'openclaw',
    openclaw: {
      url: (process.env.OPENCLAW_URL || 'http://localhost:8891').replace(/\/+$/, ''),
      token: process.env.OPENCLAW_TOKEN || '',
    },
    llm: {
      defaults,
      tiers: {
        chat: tierFromEnv('CHAT', defaults),
        reasoning: tierFromEnv('REASONING', defaults),
        quick: tierFromEnv('QUICK', defaults),
      },
    },
  };
}

export const config = loadConfig();
