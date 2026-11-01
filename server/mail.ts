import nodemailer from 'nodemailer';

export const STORE_EMAIL = 'info@shopwalk360.com';

export function mailConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export async function sendInquiryEmail(input: { name: string; email: string; phone: string; topic: string; message: string }) {
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || STORE_EMAIL;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.privateemail.com',
    port,
    secure: port === 465,
    auth: { user, pass: process.env.SMTP_PASS },
  });
  const to = process.env.INQUIRY_TO || STORE_EMAIL;
  const text = [
    'New inquiry from the ShopWalk 360 website',
    '',
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Phone: ${input.phone || '—'}`,
    `Topic: ${input.topic}`,
    '',
    input.message,
    '',
    'Reply to this email to answer the customer.',
  ].join('\n');
  await transporter.sendMail({
    from: `"ShopWalk 360" <${user}>`,
    to,
    replyTo: input.email,
    subject: `ShopWalk 360 inquiry — ${input.topic}`,
    text,
  });
}
