export type StartupEnvStatus = {
  nodeEnv: string;
  port: number;
  logLevel: string;
  llmConfigured: boolean;
  warnings: string[];
};

export function validateStartupEnv(): StartupEnvStatus {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const port = Number(process.env.PORT ?? 3000);
  const logLevel = process.env.LOG_LEVEL ?? (nodeEnv === 'production' ? 'info' : 'debug');
  const llmConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const warnings: string[] = [];

  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${process.env.PORT}`);
  }

  if (nodeEnv === 'production' && !llmConfigured) {
    warnings.push(
      'OPENAI_API_KEY is not set. Structured-event handovers will work; free-text night-log extraction will fail at request time.',
    );
  }

  return { nodeEnv, port, logLevel, llmConfigured, warnings };
}
