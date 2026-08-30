describe('config.ts runtime constraints', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('correctly resolves and strips trailing slashes', () => {
    process.env.NODE_ENV = 'development';
    process.env.EXPO_PUBLIC_API_URL = 'https://valid.com/api/v1/';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-ref.supabase.co/';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'valid-anon-key-12345678901234567890';
    
    const config = require('./config');
    expect(config.API_URL).toBe('https://valid.com/api/v1');
    expect(config.SOCKET_URL).toBe('https://valid.com');
    expect(config.SUPABASE_URL).toBe('https://test-ref.supabase.co');
    expect(config.SUPABASE_PROJECT_REF).toBe('test-ref');
  });

  it('rejects localhost in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:4000/api/v1';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://valid.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'valid-anon-key-12345678901234567890';
    
    expect(() => {
      require('./config');
    }).toThrow('EXPO_PUBLIC_API_URL cannot be localhost in production.');
  });

  it('rejects obsolete hostname in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://skillbridge-api.onrender.com/api/v1';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://valid.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'valid-anon-key-12345678901234567890';
    
    expect(() => {
      require('./config');
    }).toThrow('EXPO_PUBLIC_API_URL is using the obsolete hostname in production.');
  });

  it('rejects missing Supabase URL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://skillbridge-api-pd9c.onrender.com/api/v1';
    process.env.EXPO_PUBLIC_SUPABASE_URL = '';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'valid-anon-key-12345678901234567890';
    
    expect(() => {
      require('./config');
    }).toThrow('EXPO_PUBLIC_SUPABASE_URL is required in production.');
  });

  it('rejects non-HTTPS Supabase URL in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://skillbridge-api-pd9c.onrender.com/api/v1';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://insecure.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'valid-anon-key-12345678901234567890';
    
    expect(() => {
      require('./config');
    }).toThrow('EXPO_PUBLIC_SUPABASE_URL must use HTTPS in production.');
  });

  it('rejects missing Supabase anon key in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://skillbridge-api-pd9c.onrender.com/api/v1';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://valid.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = '';
    
    expect(() => {
      require('./config');
    }).toThrow('EXPO_PUBLIC_SUPABASE_ANON_KEY is required in production.');
  });

  it('blocks if service role key is accidentally present in client env', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-service-role-key-never-allow';
    
    expect(() => {
      require('./config');
    }).toThrow('CRITICAL_SECURITY_VIOLATION');
  });

  it('allows correct production configuration', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://skillbridge-api-pd9c.onrender.com/api/v1';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://test-prod-ref.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'valid-anon-key-12345678901234567890';
    
    const config = require('./config');
    expect(config.API_URL).toBe('https://skillbridge-api-pd9c.onrender.com/api/v1');
    expect(config.SOCKET_URL).toBe('https://skillbridge-api-pd9c.onrender.com');
    expect(config.SUPABASE_URL).toBe('https://test-prod-ref.supabase.co');
    expect(config.SUPABASE_PROJECT_REF).toBe('test-prod-ref');
  });

  it('getSupabaseProjectRef extracts project ref accurately', () => {
    const { getSupabaseProjectRef } = require('./config');
    expect(getSupabaseProjectRef('https://wyqsoxkwmulhpcoslnoj.supabase.co')).toBe('wyqsoxkwmulhpcoslnoj');
    expect(getSupabaseProjectRef('https://abc-123.supabase.co/')).toBe('abc-123');
    expect(getSupabaseProjectRef('invalid-url')).toBe('unknown');
    expect(getSupabaseProjectRef('')).toBe('unknown');
  });
});
