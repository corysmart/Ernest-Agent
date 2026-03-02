/**
 * ernest-mail HTTP client helpers for tool integrations.
 *
 * This module is intentionally side-effect free so tools can opt in to
 * ernest-mail routing when ERNEST_MAIL_URL is configured.
 *
 * For POST /emails/send: ernest-mail requires X-Attestation (TPM/FIDO2).
 * Set ERNEST_MAIL_AGENT_ID + ERNEST_MAIL_ATTESTATION_PRIVATE_KEY (PEM) to enable.
 * Register the agent first via registerErnestMailAgent().
 */

import { createTpmAttestation, createSelfRegisterAttestation } from './attestation-client';

export interface ErnestMailConfig {
  enabled: boolean;
  baseUrl?: string;
  apiKey?: string;
  error?: string;
  /** When set, send uses X-Attestation instead of API key for /emails/send */
  attestation?: {
    agentId: string;
    privateKeyPem: string;
  };
  /** One-time token for self-registration. Required when using attestation. */
  registrationToken?: string;
}

export interface ErnestMailEnvValidationResult {
  enabled: boolean;
  valid: boolean;
  errors: string[];
}

export interface ErnestMailRequestResult<T = unknown> {
  success: boolean;
  status?: number;
  data?: T;
  error?: string;
}

export interface ErnestMailCreateAccountInput {
  email: string;
  provider: string;
  status?: string;
  smtp?: Record<string, unknown>;
}

export interface ErnestMailSendEmailInput {
  accountId?: string;
  to: string;
  subject: string;
  body?: string;
  html?: string;
  replyTo?: string;
  tenantId?: string;
}

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

export function validateErnestMailEnv(): ErnestMailEnvValidationResult {
  const errors: string[] = [];
  const rawUrl = process.env.ERNEST_MAIL_URL;

  if (!rawUrl || !rawUrl.trim()) {
    return { enabled: false, valid: true, errors };
  }

  const trimmedUrl = rawUrl.trim();
  try {
    const parsed = new URL(trimmedUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      errors.push('ERNEST_MAIL_URL must use http or https');
    }
  } catch {
    errors.push('ERNEST_MAIL_URL must be a valid URL');
  }

  const apiKey = process.env.ERNEST_MAIL_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    errors.push('ERNEST_MAIL_API_KEY is required when ERNEST_MAIL_URL is set');
  }

  return {
    enabled: true,
    valid: errors.length === 0,
    errors
  };
}

export function getErnestMailConfigFromEnv(): ErnestMailConfig {
  const validation = validateErnestMailEnv();
  if (!validation.enabled) {
    return { enabled: false };
  }

  if (!validation.valid) {
    return {
      enabled: true,
      error: validation.errors.join('; ')
    };
  }

  const baseUrl = normalizeBaseUrl(process.env.ERNEST_MAIL_URL as string);
  const apiKey = (process.env.ERNEST_MAIL_API_KEY as string).trim();
  const agentId = process.env.ERNEST_MAIL_AGENT_ID?.trim();
  const privateKey = process.env.ERNEST_MAIL_ATTESTATION_PRIVATE_KEY?.trim();
  const registrationToken = process.env.ERNEST_MAIL_REGISTRATION_TOKEN?.trim();
  const attestation =
    agentId && privateKey
      ? { agentId, privateKeyPem: privateKey }
      : undefined;

  return {
    enabled: true,
    baseUrl,
    apiKey,
    attestation,
    registrationToken: registrationToken || undefined
  };
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.toLowerCase().includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    const text = await response.text();
    return text || null;
  } catch {
    return null;
  }
}

function getErrorMessage(status: number, statusText: string, body: unknown): string {
  if (body && typeof body === 'object') {
    const maybeError = (body as { error?: unknown }).error;
    if (typeof maybeError === 'string' && maybeError.trim()) {
      return maybeError;
    }
  }
  if (typeof body === 'string' && body.trim()) {
    return body.trim();
  }
  return `ernest-mail request failed (${status} ${statusText || 'Unknown'})`;
}

async function ernestMailJsonRequest<T>(
  path: string,
  body: unknown,
  tenantId?: string,
  useAttestation?: boolean
): Promise<ErnestMailRequestResult<T>> {
  const config = getErnestMailConfigFromEnv();
  if (!config.enabled) {
    return { success: false, error: 'ERNEST_MAIL_URL is not configured' };
  }
  if (config.error) {
    return { success: false, error: config.error };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (useAttestation && config.attestation) {
    headers['X-Attestation'] = createTpmAttestation({
      method: 'POST',
      path,
      body,
      tenantId: tenantId?.trim() || undefined,
      privateKeyPem: config.attestation.privateKeyPem
    });
  } else {
    headers['Authorization'] = `ApiKey ${config.apiKey as string}`;
  }
  if (tenantId && tenantId.trim()) {
    headers['X-Tenant-Id'] = tenantId.trim();
  }

  try {
    const response = await fetch(`${config.baseUrl as string}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });
    const responseBody = await parseResponseBody(response);
    if (response.ok) {
      return {
        success: true,
        status: response.status,
        data: responseBody as T
      };
    }
    return {
      success: false,
      status: response.status,
      error: getErrorMessage(response.status, response.statusText, responseBody),
      data: responseBody as T
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function createErnestMailAccount(
  input: ErnestMailCreateAccountInput
): Promise<ErnestMailRequestResult> {
  return ernestMailJsonRequest('/accounts', input);
}

export async function sendViaErnestMail(
  input: ErnestMailSendEmailInput
): Promise<ErnestMailRequestResult> {
  const { tenantId, ...payload } = input;
  const body = {
    accountId: payload.accountId,
    to: payload.to,
    subject: payload.subject,
    text: payload.body,
    html: payload.html,
    ...(payload.replyTo ? { replyTo: payload.replyTo } : {})
  };
  const config = getErnestMailConfigFromEnv();
  const useAttestation = Boolean(config.attestation);
  const result = await ernestMailJsonRequest('/emails/send', body, tenantId, useAttestation);
  if (
    useAttestation &&
    config.attestation &&
    config.registrationToken &&
    !result.success &&
    result.status === 401
  ) {
    const regResult = await registerErnestMailAgent();
    if (regResult.success) {
      return ernestMailJsonRequest('/emails/send', body, tenantId, useAttestation);
    }
  }
  return result;
}

/** Self-register agent with ernest-mail. Requires token + key proof. Call once before sending, or lazy on first send. */
export async function registerErnestMailAgent(): Promise<ErnestMailRequestResult> {
  const config = getErnestMailConfigFromEnv();
  if (!config.enabled || config.error || !config.attestation) {
    return {
      success: false,
      error: 'ERNEST_MAIL_AGENT_ID and ERNEST_MAIL_ATTESTATION_PRIVATE_KEY required'
    };
  }
  if (!config.registrationToken) {
    return {
      success: false,
      error: 'ERNEST_MAIL_REGISTRATION_TOKEN required for self-registration'
    };
  }
  const attestation = createSelfRegisterAttestation({
    agentId: config.attestation.agentId,
    privateKeyPem: config.attestation.privateKeyPem
  });
  const body = { ...attestation, token: config.registrationToken };
  return ernestMailJsonRequest('/agents/self-register', body, undefined, false);
}
