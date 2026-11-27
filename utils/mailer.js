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

// ─── Shared layout wrapper ─────────────────────────────────────────────────
const layout = (body) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#ffffff">
  <div style="background:#4f46e5;color:#fff;padding:18px 24px">
    <div style="font-size:20px;font-weight:bold">🎓 Campus Placement Portal</div>
    <div style="font-size:13px;opacity:.85;margin-top:2px">Techno Main Salt Lake — Placement Cell</div>
  </div>
  <div style="padding:24px;color:#1f2937;line-height:1.65">${body}</div>
  <div style="background:#f9fafb;color:#6b7280;padding:12px 24px;font-size:12px;border-top:1px solid #e5e7eb">
    This is an automated message from the Placement Cell. Please do not reply to this email.<br>
    For queries, contact your Placement Coordinator.
  </div>
</div>`;

const infoRow = (label, value) =>
  `<tr>
    <td style="padding:7px 12px;color:#6b7280;font-size:.88rem;white-space:nowrap;width:40%">${esc(label)}</td>
    <td style="padding:7px 12px;font-weight:600;font-size:.88rem">${esc(String(value ?? '—'))}</td>
  </tr>`;

const infoTable = (rows) =>
  `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:16px 0">
    <tbody>${rows.map(([l, v]) => infoRow(l, v)).join('')}</tbody>
  </table>`;

const btn = (text, url) =>
  `<a href="${esc(url)}" style="display:inline-block;margin-top:8px;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600">${esc(text)}</a>`;

// ─── 1. Generic simple template (existing — kept for backward compat) ───────
// (exports.template is defined below unchanged)

// ─── 2. New Job Announcement email ─────────────────────────────────────────
exports.jobAnnouncementTemplate = ({ studentName, companyName, jobTitle, jobType, location, packageLPA, deadline, portalUrl }) =>
  layout(`
    <p style="margin:0 0 6px">Dear <strong>${esc(studentName)}</strong>,</p>
    <p style="margin:0 0 16px">Congratulations! A new placement drive has been announced and you are <strong style="color:#16a34a">eligible to apply</strong>.</p>

    <h3 style="margin:0 0 4px;color:#4f46e5">🏢 ${esc(companyName)} — ${esc(jobTitle)}</h3>

    ${infoTable([
      ['Job Type',    jobType],
      ['Location',    location],
      ['Package',     packageLPA],
      ['Apply Before', deadline],
    ])}

    <p style="margin:0 0 16px;color:#4b5563;font-size:.9rem">
      ⏰ Please apply through the portal before the deadline. Incomplete profiles may not be considered.
    </p>

    ${btn('Apply Now on Portal', portalUrl)}

    <p style="margin:20px 0 0;color:#6b7280;font-size:.85rem">
      Regards,<br><strong>Placement Cell</strong><br>Techno Main Salt Lake
    </p>`);

// ─── 3. Interview Notification email ───────────────────────────────────────
exports.interviewNotificationTemplate = ({
  studentName, companyName, jobTitle, roundName, roundNumber,
  date, time, mode, venue, meetingLink, portalUrl,
}) => {
  const isOnline = String(mode).toLowerCase() === 'online';
  const modeRow  = isOnline
    ? `<tr><td style="padding:7px 12px;color:#6b7280;font-size:.88rem;width:40%">Meeting Link</td>
        <td style="padding:7px 12px;font-weight:600;font-size:.88rem">
          <a href="${esc(meetingLink)}" style="color:#4f46e5">${esc(meetingLink)}</a>
        </td></tr>`
    : `<tr><td style="padding:7px 12px;color:#6b7280;font-size:.88rem;width:40%">Venue</td>
        <td style="padding:7px 12px;font-weight:600;font-size:.88rem">${esc(venue)}</td></tr>`;

  const tip = isOnline
    ? `<li>Join the meeting <strong>10 minutes before</strong> the scheduled time.</li>
       <li>Ensure a <strong>stable internet connection</strong> and a quiet environment.</li>
       <li>Keep your <strong>resume ready</strong> and camera/microphone working.</li>`
    : `<li>Arrive at the venue <strong>15 minutes before</strong> the scheduled time.</li>
       <li>Bring your <strong>updated resume</strong> and <strong>college ID card</strong>.</li>
       <li>Dress in <strong>formal attire</strong>.</li>`;

  return layout(`
    <p style="margin:0 0 6px">Dear <strong>${esc(studentName)}</strong>,</p>
    <p style="margin:0 0 4px">Congratulations! 🎉</p>
    <p style="margin:0 0 16px">
      You have been <strong style="color:#16a34a">shortlisted</strong> for the
      <strong>${esc(roundName)}</strong> for the <strong>${esc(jobTitle)}</strong> position at <strong>${esc(companyName)}</strong>.
    </p>

    <h3 style="margin:0 0 8px;color:#4f46e5">📋 Interview Details</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 16px">
      <tbody>
        ${infoRow('Job Role',          jobTitle)}
        ${infoRow('Interview Round',   `${roundName} (Round ${roundNumber})`)}
        ${infoRow('Date',              date)}
        ${infoRow('Time',              time)}
        ${infoRow('Mode',              mode)}
        ${modeRow}
      </tbody>
    </table>

    <h3 style="margin:0 0 8px;color:#4f46e5">📌 Important Instructions</h3>
    <ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:.9rem">${tip}</ul>

    ${btn('Open Placement Portal', portalUrl)}

    <p style="margin:20px 0 0;color:#6b7280;font-size:.85rem">
      Regards,<br><strong>Placement Cell</strong><br>Techno Main Salt Lake
    </p>`);
};

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
