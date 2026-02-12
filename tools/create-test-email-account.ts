/**
 * Tool: create_test_email_account
 *
 * Creates a disposable test email account via Ethereal (Nodemailer's testing service).
 * Saves credentials to the email config file so send_email can use them.
 * Emails are captured in Ethereal's web inbox—they are not delivered to real recipients.
 * For development and testing only.
 */

import nodemailer from 'nodemailer';
import type { ToolHandler } from '../security/sandboxed-tool-runner';
import { saveEmailConfig, type EtherealConfig } from './email-config';

export const createTestEmailAccount: ToolHandler = async (
  _input: Record<string, unknown>
): Promise<Record<string, unknown>> => {
  try {
    const testAccount = await nodemailer.createTestAccount();
    const config: EtherealConfig = {
      type: 'ethereal',
      user: testAccount.user,
      pass: testAccount.pass,
      smtp: {
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure
      },
      from: testAccount.user
    };
    saveEmailConfig(config);
    return {
      success: true,
      email: testAccount.user,
      message: 'Test account created. Emails sent via send_email will appear in Ethereal web inbox (testing only—not delivered to real recipients). View at https://ethereal.email'
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err)
    };
  }
};
