/**
 * Typed environment variable loader.
 * Throws on startup if any required variable is missing.
 */

function require_env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optional_env(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional_env('PORT', '4000'), 10),
  nodeEnv: optional_env('NODE_ENV', 'development'),
  allowedOrigins: optional_env('ALLOWED_ORIGINS', 'http://localhost:3000').split(','),

  db: {
    host: require_env('DATABASE_HOST'),
    port: parseInt(require_env('DATABASE_PORT'), 10),
    user: require_env('DATABASE_USER'),
    password: require_env('DATABASE_PASSWORD'),
    database: require_env('DATABASE_NAME'),
  },

  redis: {
    url: optional_env('REDIS_URL', 'redis://localhost:6379'),
  },

  jwt: {
    // Newlines stored as \n literals in env — unescape them
    privateKey: require_env('JWT_PRIVATE_KEY').replace(/\\n/g, '\n'),
    publicKey: require_env('JWT_PUBLIC_KEY').replace(/\\n/g, '\n'),
    accessTokenTtl: 30 * 24 * 60 * 60, // 30 days in seconds
    refreshTokenTtlDays: 90,
  },

  hmac: {
    emailSecret: require_env('EMAIL_SECRET'),
    resetSecret: require_env('RESET_SECRET'),
    emailTokenTtl: 24 * 60 * 60,   // 24 hours in seconds
    resetTokenTtl: 60 * 60,         // 1 hour in seconds
  },

  mailjet: {
    apiKey: require_env('MAILJET_API_KEY'),
    secretKey: require_env('MAILJET_SECRET_KEY'),
    from: require_env('EMAIL_FROM'),
  },

  appUrl: optional_env('APP_URL', 'http://localhost:3000'),
  apiUrl: optional_env('API_URL', 'http://localhost:4000'),

  nebius: {
    apiKey: require_env('NEBIUS_API_KEY'),
    baseUrl: optional_env('NEBIUS_BASE_URL', 'https://api.studio.nebius.com/v1'),
    model:   optional_env('NEBIUS_MODEL', 'minimax/MiniMax-Text-01'),
    // Dedicated (cheaper/faster) model for the translation endpoint.
    translateModel: optional_env('NEBIUS_TRANSLATE_MODEL', 'openai/gpt-oss-120b'),
  },

  // OVHcloud AI Endpoints — backup LLM used when Nebius is slow/unavailable.
  // Defaults to the same OVH endpoint/key already used for Whisper.
  ovh: {
    apiKey:  optional_env('OVH_LLM_API_KEY', process.env.WHISPER_API_KEY ?? ''),
    baseUrl: optional_env('OVH_LLM_BASE_URL', process.env.WHISPER_BASE_URL ?? 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1'),
    model:   optional_env('OVH_LLM_MODEL', 'gpt-oss-120b'),
  },

  whisper: {
    apiKey:  require_env('WHISPER_API_KEY'),
    baseUrl: require_env('WHISPER_BASE_URL'),
    model:   optional_env('WHISPER_MODEL', 'whisper-1'),
  },

  elevenlabs: {
    apiKey:   optional_env('ELEVENLABS_API_KEY', ''),
    model:    optional_env('ELEVENLABS_STT_MODEL', 'scribe_v2'),
    baseUrl:  optional_env('ELEVENLABS_BASE_URL', 'https://api.eu.residency.elevenlabs.io'),
    // Text-to-speech (translator "read aloud"). flash_v2_5 is the only model
    // covering all 32 app languages (eleven_v3 can't enforce Filipino), and is
    // fast + cheap for a live translator. The premade voice is multilingual and
    // language-agnostic; language_code enforces target-language pronunciation.
    // Both overridable via env.
    ttsModel:   optional_env('ELEVENLABS_TTS_MODEL', 'eleven_flash_v2_5'),
    ttsVoiceId: optional_env('ELEVENLABS_VOICE_ID', 'EXAVITQu4vr4xnSDxMaL'), // "Sarah" premade — mature, reassuring
  },

  corti: {
    clientId:     optional_env('CORTI_CLIENT_ID', ''),
    clientSecret: optional_env('CORTI_CLIENT_SECRET', ''),
    tenant:       optional_env('CORTI_TENANT', 'base'),
    environment:  optional_env('CORTI_ENVIRONMENT', 'eu') as 'eu' | 'us',
  },

  transcriptionProvider: optional_env('TRANSCRIPTION_PROVIDER', 'whisper') as 'whisper' | 'elevenlabs',
} as const;
