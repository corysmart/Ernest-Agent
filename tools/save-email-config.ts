/**
 * Tool: save_email_config
 *
 * Saves SMTP credentials to the email config file. The agent can call this when the user
 * provides credentials, so send_email will use them without editing .env.
 *
 * Never writes to .env. Uses EMAIL_CONFIG_PATH (default: data/email-config.json).
 */

import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { saveEmailConfig, type SmtpConfig } from './email-config';
import { createErnestMailAccount, getErnestMailConfigFromEnv } from './ernest-mail-client';

export const saveEmailConfigTool: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const host = input.host ?? input.smtpHost;
  if (typeof host !== 'string' || !host.trim()) {
    return { success: false, error: 'host (or smtpHost) is required' };
  }
  const user = input.user ?? input.smtpUser;
  if (typeof user !== 'string' || !user.trim()) {
    return { success: false, error: 'user (or smtpUser) is required' };
  }
  const pass = input.pass ?? input.smtpPass ?? input.password;
  if (typeof pass !== 'string' || !pass) {
    return { success: false, error: 'pass (or smtpPass, password) is required' };
  }

  const portRaw = input.port ?? input.smtpPort;
  const port = typeof portRaw === 'number' ? portRaw : (typeof portRaw === 'string' ? parseInt(portRaw, 10) : 587);
  const config: SmtpConfig = {
    type: 'smtp',
    host: host.trim(),
    port: Number.isFinite(port) && port > 0 ? port : 587,
    user: user.trim(),
    pass,
    from: typeof input.from === 'string' && input.from.trim() ? input.from.trim() : user.trim()
  };

  const ernestMailConfig = getErnestMailConfigFromEnv();
  if (ernestMailConfig.enabled) {
    if (ernestMailConfig.error) {
      return { success: false, error: ernestMailConfig.error };
    }
    const accountEmail =
      typeof input.email === 'string' && input.email.trim()
        ? input.email.trim()
        : config.from ?? config.user;
    const result = await createErnestMailAccount({
      email: accountEmail,
      provider: 'smtp',
      smtp: {
        host: config.host,
        port: config.port,
        user: config.user,
        pass: config.pass,
        from: config.from
      }
    });
    if (result.success) {
      return {
        success: true,
        message: 'SMTP account saved to ernest-mail.'
      };
    }
    return {
      success: false,
      error: result.error ?? 'Failed to save SMTP account to ernest-mail'
    };
  }

  try {
    saveEmailConfig(config);
    return {
      success: true,
      message: 'Email config saved. send_email will use these credentials.'
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
