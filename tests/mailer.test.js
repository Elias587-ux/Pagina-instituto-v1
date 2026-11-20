// Outgoing mail: Brevo HTTP API (works on hosts that block SMTP ports) with SMTP as fallback.
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { sendMail, isMailConfigured } = require('../utils/mailer');

const MAIL_ENV = ['BREVO_API_KEY', 'MAIL_FROM', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'];
const realFetch = global.fetch;
let savedEnv;

beforeEach(() => {
  savedEnv = Object.fromEntries(MAIL_ENV.map((k) => [k, process.env[k]]));
  MAIL_ENV.forEach((k) => delete process.env[k]);
});

afterEach(() => {
  global.fetch = realFetch;
  MAIL_ENV.forEach((k) => (savedEnv[k] === undefined ? delete process.env[k] : (process.env[k] = savedEnv[k])));
});

/** Replaces fetch with a stub that records calls and answers with the given status. */
function stubFetch(status = 201) {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return { ok: status >= 200 && status < 300, status, text: async () => '{}' };
  };
  return calls;
}

const message = { to: 'ana@gmail.com', subject: 'Respuesta a tu consulta', text: 'Hola Ana', replyTo: 'ies11@gmail.com' };

test('without configuration it does not send and reports not_configured', async () => {
  const calls = stubFetch();
  assert.equal(isMailConfigured(), false);
  assert.deepEqual(await sendMail(message), { delivered: false, error: 'not_configured' });
  assert.equal(calls.length, 0);
});

test('with BREVO_API_KEY it sends through the Brevo API', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.MAIL_FROM = 'IES N° 11 <ies11@gmail.com>';
  const calls = stubFetch(201);

  assert.equal(isMailConfigured(), true);
  assert.deepEqual(await sendMail(message), { delivered: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.brevo.com/v3/smtp/email');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['api-key'], 'xkeysib-test');
  assert.deepEqual(calls[0].body, {
    sender: { name: 'IES N° 11', email: 'ies11@gmail.com' },
    to: [{ email: 'ana@gmail.com' }],
    subject: 'Respuesta a tu consulta',
    textContent: 'Hola Ana',
    replyTo: { email: 'ies11@gmail.com' },
  });
});

test('MAIL_FROM without a display name is used as the sender email', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.MAIL_FROM = 'ies11@gmail.com';
  const calls = stubFetch(201);
  await sendMail({ ...message, replyTo: undefined });
  assert.deepEqual(calls[0].body.sender, { email: 'ies11@gmail.com' });
  assert.equal('replyTo' in calls[0].body, false);
});

test('strips line breaks from subject and addresses (no header injection)', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.MAIL_FROM = 'ies11@gmail.com';
  const calls = stubFetch(201);
  await sendMail({ ...message, subject: 'Hola\r\nBcc: x@y.com' });
  assert.equal(calls[0].body.subject, 'Hola Bcc: x@y.com');
});

test('BREVO_API_KEY without MAIL_FROM is not enough to send', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  const calls = stubFetch(201);
  assert.equal(isMailConfigured(), false);
  assert.deepEqual(await sendMail(message), { delivered: false, error: 'not_configured' });
  assert.equal(calls.length, 0);
});

test('a reply-to written as "Name <email>" sends only the address', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.MAIL_FROM = 'ies11@gmail.com';
  const calls = stubFetch(201);
  await sendMail({ ...message, replyTo: 'Secretaría <secretaria@gmail.com>' });
  assert.deepEqual(calls[0].body.replyTo, { email: 'secretaria@gmail.com' });
});

test('a Brevo error response is reported as send_failed', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.MAIL_FROM = 'ies11@gmail.com';
  stubFetch(401);
  assert.deepEqual(await sendMail(message), { delivered: false, error: 'send_failed' });
});

test('a network failure is reported as send_failed', async () => {
  process.env.BREVO_API_KEY = 'xkeysib-test';
  process.env.MAIL_FROM = 'ies11@gmail.com';
  global.fetch = async () => {
    throw new Error('ECONNRESET');
  };
  assert.deepEqual(await sendMail(message), { delivered: false, error: 'send_failed' });
});
