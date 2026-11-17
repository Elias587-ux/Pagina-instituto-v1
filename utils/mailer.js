/**
 * Outgoing email (SMTP). Configure with SMTP_HOST, SMTP_PORT, SMTP_USER,
 * SMTP_PASS and MAIL_FROM. When it is not configured, sendMail() resolves
 * to { delivered: false } so callers can offer a manual fallback.
 */
const nodemailer = require('nodemailer');

let transporter = null;

const isMailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
}

/** Removes CR/LF so user-supplied values can never inject extra mail headers. */
const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

/**
 * @param {{ to: string, subject: string, text: string, replyTo?: string }} message
 * @returns {Promise<{ delivered: boolean, error?: string }>}
 */
async function sendMail({ to, subject, text, replyTo }) {
  const transport = getTransporter();
  if (!transport) return { delivered: false, error: 'not_configured' };
  try {
    await transport.sendMail({
      from: oneLine(process.env.MAIL_FROM || process.env.SMTP_USER),
      to: oneLine(to),
      subject: oneLine(subject),
      text,
      ...(replyTo ? { replyTo: oneLine(replyTo) } : {}),
    });
    return { delivered: true };
  } catch (err) {
    console.error('[mailer] Error al enviar correo:', err.message);
    return { delivered: false, error: 'send_failed' };
  }
}

module.exports = { sendMail, isMailConfigured };
