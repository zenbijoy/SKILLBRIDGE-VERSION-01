import { SUPABASE_PROJECT_REF } from '@/lib/config';

export type AuthErrorCategory =
  | 'NETWORK_UNAVAILABLE'
  | 'DNS_FAILURE'
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_ALREADY_REGISTERED'
  | 'AUTH_WEAK_PASSWORD'
  | 'AUTH_RATE_LIMITED'
  | 'OAUTH_CANCELLED'
  | 'OAUTH_PROVIDER_DISABLED'
  | 'OAUTH_BROWSER_FAILED'
  | 'OAUTH_CALLBACK_INVALID'
  | 'OAUTH_CODE_EXCHANGE_FAILED'
  | 'OAUTH_SESSION_FAILED'
  | 'OAUTH_NETWORK_ERROR'
  | 'OAUTH_CONFIG_ERROR'
  | 'OAUTH_UNKNOWN'
  | 'AUTH_UNKNOWN';

export interface ClassifiedAuthError {
  category: AuthErrorCategory;
  title: string;
  message: string;
  rawMessage: string;
  isNetworkError: boolean;
  isCancelled?: boolean;
}

export function classifyAuthError(error: unknown): ClassifiedAuthError {
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
      ? error
      : (error as { message?: string })?.message || 'An unexpected error occurred';

  const normalized = rawMessage.toLowerCase();

  const code = (error as { code?: string | number })?.code;

  // 1. User Cancellation
  if (
    code === '12501' ||
    code === 12501 ||
    code === 'SIGN_IN_CANCELLED' ||
    normalized.includes('cancelled') ||
    normalized.includes('canceled') ||
    normalized.includes('dismissed') ||
    normalized.includes('user cancelled') ||
    normalized.includes('user canceled') ||
    normalized.includes('oauth_cancelled')
  ) {
    return {
      category: 'OAUTH_CANCELLED',
      title: 'Sign in cancelled',
      message: 'Sign-in was cancelled.',
      rawMessage,
      isNetworkError: false,
      isCancelled: true,
    };
  }

  // 1b. Google Play Services Unavailable
  if (
    code === 'PLAY_SERVICES_NOT_AVAILABLE' ||
    normalized.includes('play services not available') ||
    normalized.includes('play_services_not_available')
  ) {
    return {
      category: 'OAUTH_UNKNOWN',
      title: 'Google Play Services unavailable',
      message: 'Google Play Services is not available or outdated on this device.',
      rawMessage,
      isNetworkError: false,
    };
  }

  // 1c. Google Sign-In In Progress
  if (
    code === 'IN_PROGRESS' ||
    normalized.includes('in_progress') ||
    normalized.includes('already in progress')
  ) {
    return {
      category: 'OAUTH_UNKNOWN',
      title: 'Please wait',
      message: 'A sign-in request is already in progress.',
      rawMessage,
      isNetworkError: false,
    };
  }

  // 2. Provider Disabled / Configuration Error
  if (
    code === 'DEVELOPER_ERROR' ||
    code === 10 ||
    code === '10' ||
    normalized.includes('developer_error')
  ) {
    return {
      category: 'OAUTH_CONFIG_ERROR',
      title: 'Configuration error',
      message: 'Google sign-in configuration error. Please verify SHA-1 and Client ID settings.',
      rawMessage,
      isNetworkError: false,
    };
  }

  // 2b. Missing ID Token
  if (
    normalized.includes('no id token') ||
    normalized.includes('missing id token')
  ) {
    return {
      category: 'OAUTH_UNKNOWN',
      title: 'Sign in failed',
      message: 'No ID token returned by Google authentication.',
      rawMessage,
      isNetworkError: false,
    };
  }

  if (
    normalized.includes('provider is not enabled') ||
    normalized.includes('provider disabled') ||
    normalized.includes('unsupported provider') ||
    normalized.includes('oauth_provider_disabled')
  ) {
    return {
      category: 'OAUTH_PROVIDER_DISABLED',
      title: 'Sign in unavailable',
      message: 'Google sign-in is not enabled for this project. Please contact support.',
      rawMessage,
      isNetworkError: false,
    };
  }

  if (
    normalized.includes('redirect_uri_mismatch') ||
    normalized.includes('invalid redirect uri') ||
    normalized.includes('invalid_client') ||
    normalized.includes('oauth_config_error')
  ) {
    return {
      category: 'OAUTH_CONFIG_ERROR',
      title: 'Configuration error',
      message: 'Authentication configuration mismatch. Please try again later.',
      rawMessage,
      isNetworkError: false,
    };
  }

  // 3. DNS Resolution Failure
  if (
    normalized.includes('unknownhostexception') ||
    normalized.includes('unable to resolve host') ||
    normalized.includes('no address associated with hostname') ||
    normalized.includes('enotfound') ||
    normalized.includes('eai_again') ||
    normalized.includes('getaddrinfo')
  ) {
    return {
      category: 'DNS_FAILURE',
      title: 'Unable to connect',
      message:
        "We couldn't reach the authentication service. Check your internet connection and try again.",
      rawMessage,
      isNetworkError: true,
    };
  }

  // 4. Generic Network Failure / Offline
  if (
    normalized.includes('fetch failed') ||
    normalized.includes('network request failed') ||
    normalized.includes('failed to fetch') ||
    normalized.includes('networkerror') ||
    normalized.includes('socketexception') ||
    normalized.includes('aborterror') ||
    normalized.includes('connection refused') ||
    normalized.includes('connection timed out') ||
    normalized.includes('err_internet_disconnected') ||
    normalized.includes('err_network') ||
    normalized.includes('oauth_network_error')
  ) {
    return {
      category: normalized.includes('oauth') ? 'OAUTH_NETWORK_ERROR' : 'NETWORK_UNAVAILABLE',
      title: 'Connection error',
      message:
        'A network connection error occurred. Please check your connection and try again.',
      rawMessage,
      isNetworkError: true,
    };
  }

  // 5. OAuth Code Exchange / Session / Callback Failure
  if (
    normalized.includes('exchange code') ||
    normalized.includes('code verifier') ||
    normalized.includes('invalid code') ||
    normalized.includes('pkce') ||
    normalized.includes('oauth_code_exchange_failed')
  ) {
    return {
      category: 'OAUTH_CODE_EXCHANGE_FAILED',
      title: 'Sign in failed',
      message: "Google sign-in couldn't be completed. Please try again.",
      rawMessage,
      isNetworkError: false,
    };
  }

  if (
    normalized.includes('invalid callback') ||
    normalized.includes('oauth_callback_invalid') ||
    normalized.includes('missing authentication tokens') ||
    normalized.includes('invalid or missing')
  ) {
    return {
      category: 'OAUTH_CALLBACK_INVALID',
      title: 'Sign in failed',
      message: "Google sign-in couldn't be completed. Please try again.",
      rawMessage,
      isNetworkError: false,
    };
  }

  if (
    normalized.includes('browser failed') ||
    normalized.includes('unable to open browser') ||
    normalized.includes('oauth_browser_failed')
  ) {
    return {
      category: 'OAUTH_BROWSER_FAILED',
      title: 'Browser error',
      message: 'Could not open browser for sign in. Please try again.',
      rawMessage,
      isNetworkError: false,
    };
  }

  if (
    normalized.includes('oauth_session_failed') ||
    normalized.includes('failed to create session')
  ) {
    return {
      category: 'OAUTH_SESSION_FAILED',
      title: 'Sign in failed',
      message: "Google sign-in couldn't be completed. Please try again.",
      rawMessage,
      isNetworkError: false,
    };
  }

  // 6. Invalid Credentials / Verification
  if (
    normalized.includes('invalid login credentials') ||
    normalized.includes('invalid_grant') ||
    normalized.includes('invalid_credentials') ||
    normalized.includes('invalid password') ||
    normalized.includes('user not found')
  ) {
    return {
      category: 'AUTH_INVALID_CREDENTIALS',
      title: 'Sign in failed',
      message: 'Invalid email or password. Please check your credentials.',
      rawMessage,
      isNetworkError: false,
    };
  }

  if (normalized.includes('email not confirmed')) {
    return {
      category: 'AUTH_INVALID_CREDENTIALS',
      title: 'Email not verified',
      message: 'Your email has not been verified yet. Please check your inbox for the verification link.',
      rawMessage,
      isNetworkError: false,
    };
  }

  // 7. Email Already Registered
  if (
    normalized.includes('user already registered') ||
    normalized.includes('email_exists') ||
    normalized.includes('already registered') ||
    normalized.includes('already taken') ||
    normalized.includes('already exists')
  ) {
    return {
      category: 'AUTH_EMAIL_ALREADY_REGISTERED',
      title: 'Account already exists',
      message: 'An account with this email already exists. Please sign in instead.',
      rawMessage,
      isNetworkError: false,
    };
  }

  // 8. Weak Password
  if (
    normalized.includes('password should be at least') ||
    normalized.includes('weak_password') ||
    normalized.includes('password is too short') ||
    normalized.includes('password must')
  ) {
    return {
      category: 'AUTH_WEAK_PASSWORD',
      title: 'Password too weak',
      message: 'Please choose a stronger password with at least 6 characters.',
      rawMessage,
      isNetworkError: false,
    };
  }

  // 9. Rate Limited
  if (
    normalized.includes('rate limit') ||
    normalized.includes('too many requests') ||
    normalized.includes('over_email_send_rate_limit') ||
    normalized.includes('429')
  ) {
    return {
      category: 'AUTH_RATE_LIMITED',
      title: 'Too many attempts',
      message: 'Too many requests. Please wait a few moments before trying again.',
      rawMessage,
      isNetworkError: false,
    };
  }

  // 10. Unknown / Fallback
  return {
    category: 'AUTH_UNKNOWN',
    title: 'Authentication error',
    message: rawMessage || 'An unexpected authentication error occurred. Please try again.',
    rawMessage,
    isNetworkError: false,
  };
}

export type AuthLogEvent =
  | 'auth_signup_failed'
  | 'auth_signin_failed'
  | 'auth_reset_failed'
  | 'oauth_google_started'
  | 'oauth_google_browser_opened'
  | 'oauth_google_cancelled'
  | 'oauth_google_callback_received'
  | 'oauth_google_session_created'
  | 'oauth_google_failed';

export function logAuthEvent(
  event: AuthLogEvent,
  details: {
    provider?: string;
    platform?: string;
    category?: AuthErrorCategory;
    error?: unknown;
    isNewUser?: boolean;
    hasCode?: boolean;
    hasTokens?: boolean;
    flow?: string;
  } = {}
): void {
  const classified = details.error ? classifyAuthError(details.error) : undefined;
  
  if (__DEV__) {
    // Structured diagnostic data - strictly NEVER log tokens or credentials
    console.warn(`[AUTH] ${event}:`, {
      provider: details.provider || 'google',
      platform: details.platform,
      flow: details.flow,
      category: details.category || classified?.category,
      isNetworkError: classified?.isNetworkError,
      isCancelled: classified?.isCancelled,
      isNewUser: details.isNewUser,
      hasCode: details.hasCode,
      hasTokens: details.hasTokens,
      supabaseProjectRef: SUPABASE_PROJECT_REF,
      rawMessage: classified?.rawMessage,
    });
  }
}

export function logAuthFailure(
  event: 'auth_signup_failed' | 'auth_signin_failed' | 'auth_reset_failed' | 'oauth_google_failed',
  details: {
    provider?: string;
    error: unknown;
  }
): void {
  logAuthEvent(event, details);
}

