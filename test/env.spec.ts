import { validateStartupEnv } from '../src/config/env';

describe('startup env validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('warns in production when OPENAI_API_KEY is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.OPENAI_API_KEY;
    const status = validateStartupEnv();
    expect(status.llmConfigured).toBe(false);
    expect(status.warnings.length).toBeGreaterThan(0);
  });

  it('rejects invalid PORT', () => {
    process.env.PORT = 'not-a-port';
    expect(() => validateStartupEnv()).toThrow('Invalid PORT');
  });
});
