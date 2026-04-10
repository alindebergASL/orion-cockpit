import type { LLMProvider } from './types.js';
import type { TierConfig, ProviderType } from '../../config.js';
import { AnthropicAdapter } from './anthropic.js';
import { OpenAICompatAdapter } from './openai-compat.js';

export function createProvider(tierConfig: TierConfig): LLMProvider {
  const provider = tierConfig.provider;
  switch (provider) {
    case 'anthropic':
      return new AnthropicAdapter(tierConfig);
    case 'openai':
    case 'openrouter':
    case 'custom':
      return new OpenAICompatAdapter(tierConfig);
    default:
      throw new Error(`Unknown LLM provider: ${provider satisfies never}`);
  }
}

// Cache providers per tier to reuse SDK clients
const cache = new Map<string, LLMProvider>();

export function getProvider(tier: 'chat' | 'reasoning' | 'quick', tiers: Record<string, TierConfig>): LLMProvider {
  const key = tier;
  if (!cache.has(key)) {
    cache.set(key, createProvider(tiers[tier]));
  }
  return cache.get(key)!;
}
