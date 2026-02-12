/**
 * Tool: send_email
 *
 * Sends an email via SMTP. Uses env vars (SMTP_HOST, etc.) or email config file.
 * Config can be populated by create_test_email_account or save_email_config.
 */

import nodemailer from 'nodemailer';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { loadEmailConfig } from './email-config';

function getTransporter() {
  const config = loadEmailConfig();
  if (!config) return null;
  if (config.type === 'smtp') {
    return nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass }
    });
  }
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: { user: config.user, pass: config.pass }
  });
}

export const sendEmail: ToolHandler = async (
  input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  const to = input.to;
  if (typeof to !== 'string' || !to.trim()) {
    return { success: false, error: 'to is required and must be a non-empty string' };
  }
  const subject = input.subject;
  if (typeof subject !== 'string' || !subject.trim()) {
    return { success: false, error: 'subject is required and must be a non-empty string' };
  }
  const body = input.body ?? input.text ?? input.content;
  const html = input.html;
  const config = loadEmailConfig();
  const fromAddr = config?.from ?? process.env.EMAIL_FROM ?? process.env.SMTP_USER;

  const transporter = getTransporter();
  if (!transporter) {
    return {
      success: false,
      error: 'Email not configured. Use create_test_email_account (for testing) or save_email_config (with SMTP credentials), or set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.'
    };
  }

  const textContent = typeof body === 'string' ? body : '';
  const htmlContent = typeof html === 'string' ? html : '';
  const hasContent = textContent.trim() || htmlContent.trim();
  if (!hasContent) {
    return { success: false, error: 'body (or text, content) or html is required and must be non-empty' };
  }

  try {
    await transporter.sendMail({
      from: fromAddr,
      to: to.trim(),
      subject: String(subject).trim(),
      ...(htmlContent.trim()
        ? { html: htmlContent.trim(), text: textContent.trim() || htmlContent.replace(/<[^>]+>/g, '').trim() }
        : { text: textContent.trim() })
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
