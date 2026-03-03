/**
 * Tool: read_email
 *
 * List or read received emails. Uses ernest-mail (Resend Inbound) when
 * ERNEST_MAIL_URL is configured with attestation. Requires Resend Inbound
 * to be set up (receiving domain).
 */

import type { ToolHandler } from '../security/sandboxed-tool-runner';
import {
  getErnestMailConfigFromEnv,
  listReceivedEmailsViaErnestMail,
  getReceivedEmailViaErnestMail
} from './ernest-mail-client';

export const readEmail: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const config = getErnestMailConfigFromEnv();
  if (!config.enabled) {
    return {
      success: false,
      error:
        'ERNEST_MAIL_URL is not configured. Set ERNEST_MAIL_URL, ERNEST_MAIL_API_KEY, ERNEST_MAIL_AGENT_ID, ERNEST_MAIL_ATTESTATION_PRIVATE_KEY, and ERNEST_MAIL_REGISTRATION_TOKEN to read emails via Resend Inbound.'
    };
  }
  if (config.error) {
    return { success: false, error: config.error };
  }
  if (!config.attestation) {
    return {
      success: false,
      error: 'ERNEST_MAIL_AGENT_ID and ERNEST_MAIL_ATTESTATION_PRIVATE_KEY required for read_email.'
    };
  }

  const action = input.action ?? input.mode ?? 'list';
  const tenantId = typeof input.tenantId === 'string' ? input.tenantId.trim() : undefined;
  const tenantIdAlt = typeof input.tenant_id === 'string' ? input.tenant_id.trim() : undefined;
  const effectiveTenantId = tenantId || tenantIdAlt;

  if (action === 'get' || action === 'read') {
    const id = input.id ?? input.emailId ?? input.email_id;
    if (typeof id !== 'string' || !id.trim()) {
      return { success: false, error: 'id (or emailId) is required to read a single email.' };
    }
    const result = await getReceivedEmailViaErnestMail(id.trim(), effectiveTenantId);
    if (result.success && result.data) {
      return {
        success: true,
        data: result.data,
        subject: result.data.subject,
        from: result.data.from,
        to: result.data.to,
        text: result.data.text ?? null,
        html: result.data.html ?? null,
        created_at: result.data.created_at
      };
    }
    return {
      success: false,
      error: result.error ?? 'Failed to retrieve email',
      status: result.status
    };
  }

  // list
  const limitRaw = input.limit ?? input.limit_count;
  const limit =
    typeof limitRaw === 'number'
      ? Math.min(100, Math.max(1, limitRaw))
      : typeof limitRaw === 'string'
        ? Math.min(100, Math.max(1, parseInt(limitRaw, 10) || 20))
        : undefined;
  const after = typeof input.after === 'string' ? input.after.trim() : undefined;
  const before = typeof input.before === 'string' ? input.before.trim() : undefined;

  const result = await listReceivedEmailsViaErnestMail({
    limit,
    after,
    before,
    tenantId: effectiveTenantId
  });

  if (result.success && result.data) {
    const list = result.data.data ?? [];
    return {
      success: true,
      data: list,
      count: list.length,
      has_more: result.data.has_more ?? false,
      emails: list.map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        subject: e.subject,
        created_at: e.created_at
      }))
    };
  }

  return {
    success: false,
    error: result.error ?? 'Failed to list received emails',
    status: result.status
  };
};
