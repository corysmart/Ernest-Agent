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
