const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user, pass },
  });
  return transporter;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendFeedbackEmail({ type, message, email, userId, username, accountEmail }) {
  const to = process.env.FEEDBACK_EMAIL_TO;
  const t = getTransporter();
  if (!to || !t) return;

  const subject = `[I Can Feedback] ${type}`;
  const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#222;">
      <h2 style="margin:0 0 12px 0;">New ${escapeHtml(type)} received</h2>
      <table style="border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">User ID</td><td>${escapeHtml(userId)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Username</td><td>${escapeHtml(username || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Account Email</td><td>${escapeHtml(accountEmail || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Reply Email</td><td>${escapeHtml(email || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Type</td><td>${escapeHtml(type)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Time</td><td>${new Date().toISOString()}</td></tr>
      </table>
      <div style="padding:12px;background:#f6f6f6;border-radius:8px;white-space:pre-wrap;">${safeMessage}</div>
    </div>
  `;
  const text = `New ${type} received\n\nUser: ${userId} (${username || '—'})\nAccount: ${accountEmail || '—'}\nReply: ${email || '—'}\nTime: ${new Date().toISOString()}\n\n${message}`;

  await t.sendMail({
    from: process.env.SMTP_FROM || `I Can Feedback <${process.env.SMTP_USER}>`,
    to,
    replyTo: email || undefined,
    subject,
    text,
    html,
  });
}

const EVENT_LABELS = {
  new_subscription: 'New Subscription',
  resubscribe: 'Resubscription',
  renewed: 'Subscription Renewed',
  refunded: 'Subscription Refunded',
  revoked: 'Subscription Revoked',
};

async function sendSubscriptionEmail({ event, productId, userId, username, accountEmail, periodEnd, transactionId }) {
  const to = process.env.SUBSCRIPTION_EMAIL_TO || process.env.FEEDBACK_EMAIL_TO;
  const t = getTransporter();
  if (!to || !t) return;

  const label = EVENT_LABELS[event] || event;
  const subject = `[I Can] ${label} — ${productId || 'unknown product'}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;color:#222;">
      <h2 style="margin:0 0 12px 0;">${escapeHtml(label)}</h2>
      <table style="border-collapse:collapse;margin-bottom:16px;">
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Event</td><td>${escapeHtml(event)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Product</td><td>${escapeHtml(productId || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">User ID</td><td>${escapeHtml(userId)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Username</td><td>${escapeHtml(username || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Account Email</td><td>${escapeHtml(accountEmail || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Transaction</td><td>${escapeHtml(transactionId || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Period Ends</td><td>${escapeHtml(periodEnd || '—')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666;">Time</td><td>${new Date().toISOString()}</td></tr>
      </table>
    </div>
  `;
  const text = `${label}\n\nEvent: ${event}\nProduct: ${productId || '—'}\nUser: ${userId} (${username || '—'})\nAccount: ${accountEmail || '—'}\nTransaction: ${transactionId || '—'}\nPeriod ends: ${periodEnd || '—'}\nTime: ${new Date().toISOString()}`;

  await t.sendMail({
    from: process.env.SMTP_FROM || `I Can Subscriptions <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
    html,
  });
}

module.exports = { sendFeedbackEmail, sendSubscriptionEmail };
