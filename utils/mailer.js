/**
 * Outgoing email. Two transports, in order of preference:
 *  1. Brevo HTTP API (BREVO_API_KEY + MAIL_FROM, both required). Works on hosts that block
 *     SMTP ports, like Render's free plan. MAIL_FROM must be a sender
 *     verified in Brevo, e.g. "IES N° 11 <ies11@gmail.com>".
 *  2. SMTP (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM).
 * When neither is configured, sendMail() resolves to { delivered: false } so
 * callers can offer a manual fallback.
 */
const nodemailer = require('nodemailer');

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

let transporter = null;

const isBrevoConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);
const isSmtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const isMailConfigured = () => isBrevoConfigured() || isSmtpConfigured();

function getTransporter() {
  if (!isSmtpConfigured()) return null;
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

/** "Name <email>" → { name, email }; a bare address → { email }. */
function parseAddress(value) {
  const raw = oneLine(value);
  const match = raw.match(/^(.*)<([^>]+)>$/);
  if (!match) return { email: raw };
  const name = match[1].trim().replace(/^"|"$/g, '');
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

async function sendWithBrevo({ to, subject, text, replyTo }) {
  const res = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: parseAddress(process.env.MAIL_FROM),
      to: [{ email: oneLine(to) }],
      subject: oneLine(subject),
      textContent: text,
      ...(replyTo ? { replyTo: { email: parseAddress(replyTo).email } } : {}),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Brevo respondió ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

async function sendWithSmtp({ to, subject, text, replyTo }) {
  await getTransporter().sendMail({
    from: oneLine(process.env.MAIL_FROM || process.env.SMTP_USER),
    to: oneLine(to),
    subject: oneLine(subject),
    text,
    ...(replyTo ? { replyTo: oneLine(replyTo) } : {}),
  });
}

/**
 * @param {{ to: string, subject: string, text: string, replyTo?: string }} message
 * @returns {Promise<{ delivered: boolean, error?: string }>}
 */
async function sendMail(message) {
  if (!isMailConfigured()) return { delivered: false, error: 'not_configured' };
  try {
    await (isBrevoConfigured() ? sendWithBrevo(message) : sendWithSmtp(message));
    return { delivered: true };
  } catch (err) {
    console.error('[mailer] Error al enviar correo:', err.message);
    return { delivered: false, error: 'send_failed' };
  }
}

module.exports = { sendMail, isMailConfigured };
