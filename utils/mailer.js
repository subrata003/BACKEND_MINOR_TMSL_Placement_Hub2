const nodemailer = require('nodemailer');
let transporter;
const enabled = () => {
  const result =
    process.env.EMAIL_ENABLED === 'true' &&
    !!process.env.SMTP_USER &&
    !!process.env.SMTP_PASS;

  console.log("EMAIL SERVICE ENABLED:", result);

  return result;
};

console.log("===== EMAIL CONFIG DEBUG =====");

console.log("EMAIL_ENABLED:", process.env.EMAIL_ENABLED);
console.log("SMTP_HOST:", process.env.SMTP_HOST);
console.log("SMTP_PORT:", process.env.SMTP_PORT);
console.log("SMTP_USER exists:", !!process.env.SMTP_USER);
console.log("SMTP_PASS exists:", !!process.env.SMTP_PASS);

console.log("==============================");

const getTransport = () => {
 if (!transporter) {
  transporter = nodemailer.createTransport({
   host: process.env.SMTP_HOST || 'smtp.gmail.com',
   port: Number(process.env.SMTP_PORT) || 587,
   secure: process.env.SMTP_SECURE === 'true', // true for port 465
   auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },

  })
 }
 return transporter;
}
getTransport().verify()
  .then(() => console.log("SMTP connection successful!"))
  .catch(err => console.error("SMTP connection failed:", err.message));

const esc = (s) =>
 String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Simple branded HTML email body
exports.template = (title, message) => `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
  <div style="background:#4f46e5;color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">Campus Placement Portal</div>
  <div style="padding:20px;color:#1f2937">
    <h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>
    <p style="margin:0 0 16px;line-height:1.5">${esc(message)}</p>
    <a href="${esc(process.env.CLIENT_URL || 'http://localhost:5173')}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">Open portal</a>
  </div>
  <div style="background:#f9fafb;color:#6b7280;padding:10px 20px;font-size:12px">This is an automated message. Please do not reply.</div>
</div>`;

exports.sendMail = async ({ to, subject, text, html }) => {
 if (!enabled()) {
  console.log("Email service is disabled or credentials are missing");
  return false;
 }

 try {
  const info = await getTransport().sendMail({
   from: process.env.EMAIL_FROM ||
    `"Placement Cell" <${process.env.SMTP_USER}>`,
   to,
   subject,
   text,
   html,
  });

  console.log("Email sent successfully!");
  console.log("Message ID:", info.messageId);
  console.log("Accepted:", info.accepted);
  console.log("Rejected:", info.rejected);

  return info;

 } catch (error) {
  console.error("Email failed:", error);
  return false;
 }
};
