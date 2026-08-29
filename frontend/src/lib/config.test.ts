describe('config.ts runtime constraints', () => {
  const originalEnv = process.env;

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
    
    const config = require('./config');
    expect(config.API_URL).toBe('https://valid.com/api/v1');
    expect(config.SOCKET_URL).toBe('https://valid.com');
  });

  it('rejects localhost in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost:4000/api/v1';
    
    expect(() => {
      require('./config');
    }).toThrow('EXPO_PUBLIC_API_URL cannot be localhost in production.');
  });

  it('rejects obsolete hostname in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://skillbridge-api.onrender.com/api/v1';
    
    expect(() => {
      require('./config');
    }).toThrow('EXPO_PUBLIC_API_URL is using the obsolete hostname in production.');
  });

  it('allows correct production URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.EXPO_PUBLIC_API_URL = 'https://skillbridge-api-pd9c.onrender.com/api/v1';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://wyqsoxkwmulhpcoslnoj.supabase.co';
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test';
    
    const config = require('./config');
    expect(config.API_URL).toBe('https://skillbridge-api-pd9c.onrender.com/api/v1');
    expect(config.SOCKET_URL).toBe('https://skillbridge-api-pd9c.onrender.com');
  });
});
