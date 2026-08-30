import { classifyAuthError, logAuthFailure } from './authErrors';

describe('classifyAuthError', () => {
  it('classifies DNS resolution failures and provides user-friendly text', () => {
    const javaDnsError = new Error(
      'fetch failed: java.net.UnknownHostException: Unable to resolve host "wyqsoxkwmulhpcoslnoj.supabase.co": No address associated with hostname'
    );
    const result = classifyAuthError(javaDnsError);

    expect(result.category).toBe('DNS_FAILURE');
    expect(result.title).toBe('Unable to connect');
    expect(result.message).toContain("We couldn't reach the authentication service");
    expect(result.isNetworkError).toBe(true);
    expect(result.message).not.toContain('UnknownHostException');
  });

  it('classifies generic fetch/network failures', () => {
    const networkError = new Error('TypeError: fetch failed');
    const result = classifyAuthError(networkError);

    expect(result.category).toBe('NETWORK_UNAVAILABLE');
    expect(result.title).toBe('Connection error');
    expect(result.isNetworkError).toBe(true);
  });

  it('classifies invalid login credentials', () => {
    const credsError = new Error('Invalid login credentials');
    const result = classifyAuthError(credsError);

    expect(result.category).toBe('AUTH_INVALID_CREDENTIALS');
    expect(result.title).toBe('Sign in failed');
    expect(result.isNetworkError).toBe(false);
  });

  it('classifies unconfirmed email', () => {
    const emailError = new Error('Email not confirmed');
    const result = classifyAuthError(emailError);

    expect(result.category).toBe('AUTH_INVALID_CREDENTIALS');
    expect(result.title).toBe('Email not verified');
    expect(result.isNetworkError).toBe(false);
  });

  it('classifies duplicate email / user already registered', () => {
    const dupError = new Error('User already registered');
    const result = classifyAuthError(dupError);

    expect(result.category).toBe('AUTH_EMAIL_ALREADY_REGISTERED');
    expect(result.title).toBe('Account already exists');
    expect(result.isNetworkError).toBe(false);
  });

  it('classifies weak password', () => {
    const weakPassError = new Error('Password should be at least 6 characters');
    const result = classifyAuthError(weakPassError);

    expect(result.category).toBe('AUTH_WEAK_PASSWORD');
    expect(result.title).toBe('Password too weak');
    expect(result.isNetworkError).toBe(false);
  });

  it('classifies rate limit errors', () => {
    const rateLimitError = new Error('over_email_send_rate_limit');
    const result = classifyAuthError(rateLimitError);

    expect(result.category).toBe('AUTH_RATE_LIMITED');
    expect(result.title).toBe('Too many attempts');
    expect(result.isNetworkError).toBe(false);
  });

  it('classifies unknown errors safely without crashing', () => {
    const unknownError = { message: 'Some unexpected custom error' };
    const result = classifyAuthError(unknownError);

    expect(result.category).toBe('AUTH_UNKNOWN');
    expect(result.title).toBe('Authentication error');
    expect(result.message).toBe('Some unexpected custom error');
    expect(result.isNetworkError).toBe(false);
  });

  it('classifies OAuth cancellation', () => {
    const cancelError = new Error('User cancelled the browser session');
    const result = classifyAuthError(cancelError);

    expect(result.category).toBe('OAUTH_CANCELLED');
    expect(result.isCancelled).toBe(true);
    expect(result.title).toBe('Sign in cancelled');
  });

  it('classifies OAuth provider disabled', () => {
    const disabledError = new Error('Unsupported provider: provider is not enabled');
    const result = classifyAuthError(disabledError);

    expect(result.category).toBe('OAUTH_PROVIDER_DISABLED');
    expect(result.title).toBe('Sign in unavailable');
  });

  it('classifies OAuth config errors like redirect mismatch', () => {
    const configError = new Error('redirect_uri_mismatch');
    const result = classifyAuthError(configError);

    expect(result.category).toBe('OAUTH_CONFIG_ERROR');
    expect(result.title).toBe('Configuration error');
  });

  it('classifies OAuth PKCE code exchange failures', () => {
    const exchangeError = new Error('Failed to exchange code verifier for session');
    const result = classifyAuthError(exchangeError);

    expect(result.category).toBe('OAUTH_CODE_EXCHANGE_FAILED');
    expect(result.title).toBe('Sign in failed');
  });

  it('logAuthFailure logs safely without throwing', () => {
    expect(() => {
      logAuthFailure('auth_signup_failed', {
        provider: 'email',
        error: new Error('fetch failed'),
      });
    }).not.toThrow();
  });
});
