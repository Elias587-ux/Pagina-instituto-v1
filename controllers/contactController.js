/**
 * Contact form: the public submits a question, the admin answers it from the
 * panel and the answer is emailed to the applicant.
 */
const mongoose = require('mongoose');
const Inquiry = require('../models/Inquiry');
const Setting = require('../models/Setting');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { sendMail } = require('../utils/mailer');

const PUBLIC_FIELDS = ['name', 'email', 'phone', 'career', 'subject', 'message'];

/** POST /api/contact */
exports.submitInquiry = asyncHandler(async (req, res) => {
  const body = req.body || {};
  // Honeypot: real people never fill the hidden "website" field
  if (body.website) return res.status(201).json({ ok: true });
  if (body.consent !== true) {
    throw new AppError('Aceptá que usemos tus datos para responderte', 400, [
      { field: 'consent', message: 'Necesitamos tu permiso para responderte por correo' },
    ]);
  }

  const data = Object.fromEntries(PUBLIC_FIELDS.map((k) => [k, typeof body[k] === 'string' ? body[k] : undefined]));
  const inquiry = await Inquiry.create(data);

  // Best-effort notice to the institute inbox; the inquiry is already saved
  const settings = await Setting.getSingleton().catch(() => null);
  const inbox = process.env.CONTACT_NOTIFY_EMAIL || settings?.contact?.email;
  if (inbox) {
    sendMail({
      to: inbox,
      replyTo: inquiry.email,
      subject: `Nueva consulta web: ${inquiry.subject} — ${inquiry.name}`,
      text: `${inquiry.name} <${inquiry.email}>${inquiry.phone ? ` · ${inquiry.phone}` : ''}\nCarrera de interés: ${inquiry.career || '—'}\n\n${inquiry.message}\n\nRespondé desde el panel: ${process.env.SITE_URL || ''}/admin#inquiries`,
    });
  }

  res.status(201).json({ ok: true });
});

/** POST /api/admin/inquiries/:id/reply  Body: { message } */
exports.replyInquiry = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError('Consulta no encontrada', 404);
  const inquiry = await Inquiry.findById(req.params.id);
  if (!inquiry) throw new AppError('Consulta no encontrada', 404);

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (message.length < 2) throw new AppError('Escribí la respuesta', 400, [{ field: 'message', message: 'Escribí la respuesta' }]);
  if (message.length > 4000) throw new AppError('La respuesta admite hasta 4000 caracteres', 400);

  const settings = await Setting.getSingleton().catch(() => null);
  const subject = `Re: ${inquiry.subject} — IES N° 11`;
  const quoted = inquiry.message.split('\n').map((l) => `> ${l}`).join('\n');
  const text = `Hola ${inquiry.name}:\n\n${message}\n\nSaludos,\nIES N° 11 · Jujuy\n${settings?.contact?.phone ? `Tel.: ${settings.contact.phone}\n` : ''}\n— Tu consulta —\n${quoted}\n`;

  const { delivered } = await sendMail({ to: inquiry.email, subject, text, replyTo: settings?.contact?.email || undefined });

  inquiry.replies.push({ message, sentBy: req.user?.name || req.user?.email || '', delivered });
  inquiry.status = 'respondida';
  await inquiry.save();

  // Without SMTP the panel opens the admin's mail client with this draft
  const mailto = delivered
    ? ''
    : `mailto:${encodeURIComponent(inquiry.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
  res.json({ item: inquiry, delivered, mailto });
});
