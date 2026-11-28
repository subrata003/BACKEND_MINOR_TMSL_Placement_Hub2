const nodemailer = require('nodemailer');
<<<<<<< Updated upstream
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
=======

let transporter;

const enabled = () =>
  process.env.EMAIL_ENABLED === 'true' && !!process.env.SMTP_USER && !!process.env.SMTP_PASS;

const getTransport = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

// Verify on startup
if (process.env.EMAIL_ENABLED === 'true') {
  getTransport().verify()
    .then(() => console.log('✅ SMTP connection verified'))
    .catch(err => console.error('❌ SMTP failed:', err.message));
}

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ── Shared layout ────────────────────────────────────────────────
const layout = (body) => `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#fff">
  <div style="background:#4f46e5;color:#fff;padding:18px 24px">
    <div style="font-size:20px;font-weight:bold">🎓 Campus Placement Portal</div>
    <div style="font-size:13px;opacity:.85;margin-top:2px">Techno Main Salt Lake — Placement Cell</div>
  </div>
  <div style="padding:24px;color:#1f2937;line-height:1.65">${body}</div>
  <div style="background:#f9fafb;color:#6b7280;padding:12px 24px;font-size:12px;border-top:1px solid #e5e7eb">
    Automated message from Placement Cell, TMSL. Do not reply.<br>
    For queries, contact your Placement Coordinator.
  </div>
</div>`;

const infoRow = (l, v) =>
  `<tr><td style="padding:7px 12px;color:#6b7280;font-size:.88rem;width:40%">${esc(l)}</td>
       <td style="padding:7px 12px;font-weight:600;font-size:.88rem">${esc(String(v ?? '—'))}</td></tr>`;

const infoTable = (rows) =>
  `<table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:16px 0">
    <tbody>${rows.map(([l, v]) => infoRow(l, v)).join('')}</tbody>
  </table>`;

const btn = (text, url) =>
  `<a href="${esc(url)}" style="display:inline-block;margin-top:8px;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600">${esc(text)}</a>`;

// ── 1. Generic simple template (OTP, etc.) ───────────────────────
exports.template = (title, message) =>
  layout(`<h2 style="margin:0 0 12px">${esc(title)}</h2>
  <div style="line-height:1.6">${message}</div>
  ${btn('Open Portal', process.env.CLIENT_URL || 'http://localhost:5173')}`);

// ── 2. New Job Announcement ──────────────────────────────────────
exports.jobAnnouncementTemplate = ({ studentName, companyName, jobTitle, jobType, location, packageLPA, deadline, portalUrl }) =>
  layout(`
    <p>Dear <strong>${esc(studentName)}</strong>,</p>
    <p>A new placement drive is open and <strong style="color:#16a34a">you are eligible to apply!</strong></p>
    <h3 style="color:#4f46e5">🏢 ${esc(companyName)} — ${esc(jobTitle)}</h3>
    ${infoTable([['Job Type', jobType], ['Location', location], ['Package', packageLPA], ['Apply Before', deadline]])}
    <p style="color:#4b5563;font-size:.9rem">⏰ Apply before the deadline through the portal.</p>
    ${btn('Apply Now', portalUrl)}
    <p style="margin:20px 0 0;color:#6b7280;font-size:.85rem">Regards,<br><strong>Placement Cell</strong><br>Techno Main Salt Lake</p>`);

// ── 3. Interview Notification ────────────────────────────────────
exports.interviewNotificationTemplate = ({ studentName, companyName, jobTitle, roundName, roundNumber, date, time, mode, meetingLink, venue, additionalInstructions, portalUrl }) => {
  const isOnline = String(mode).toLowerCase() === 'online';
  const modeRow = isOnline
    ? `<tr><td style="padding:7px 12px;color:#6b7280;font-size:.88rem;width:40%">Meeting Link</td>
        <td style="padding:7px 12px;font-weight:600;font-size:.88rem"><a href="${esc(meetingLink)}" style="color:#4f46e5">${esc(meetingLink)}</a></td></tr>`
    : `<tr><td style="padding:7px 12px;color:#6b7280;font-size:.88rem;width:40%">Venue</td>
        <td style="padding:7px 12px;font-weight:600;font-size:.88rem">${esc(venue)}</td></tr>`;
  const tips = isOnline
    ? '<li>Join the meeting <strong>10 minutes before</strong> scheduled time.</li><li>Stable internet connection and working camera/microphone required.</li><li>Keep your <strong>resume ready</strong>.</li>'
    : '<li>Arrive at venue <strong>15 minutes before</strong> scheduled time.</li><li>Bring <strong>updated resume</strong> and <strong>college ID card</strong>.</li><li>Dress in <strong>formal attire</strong>.</li>';
  const instrBlock = additionalInstructions
    ? `<h3 style="color:#4f46e5;margin:16px 0 6px">📝 Additional Instructions</h3><p style="color:#374151;font-size:.9rem">${esc(additionalInstructions)}</p>` : '';
  return layout(`
    <p>Dear <strong>${esc(studentName)}</strong>,</p>
    <p>🎉 You have been <strong style="color:#16a34a">shortlisted</strong> for <strong>${esc(roundName)}</strong> for <strong>${esc(jobTitle)}</strong> at <strong>${esc(companyName)}</strong>.</p>
    <h3 style="color:#4f46e5;margin:16px 0 8px">📋 Interview Details</h3>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:0 0 16px">
      <tbody>
        ${infoRow('Job Role', jobTitle)}
        ${infoRow('Interview Round', `${roundName} (Round ${roundNumber})`)}
        ${infoRow('Date', date)}
        ${infoRow('Time', time)}
        ${infoRow('Mode', mode)}
        ${modeRow}
      </tbody>
    </table>
    <h3 style="color:#4f46e5;margin:0 0 8px">📌 Important Instructions</h3>
    <ul style="margin:0 0 16px;padding-left:20px;color:#374151;font-size:.9rem">${tips}</ul>
    ${instrBlock}
    ${btn('Open Placement Portal', portalUrl)}
    <p style="margin:20px 0 0;color:#6b7280;font-size:.85rem">Regards,<br><strong>Placement Cell</strong><br>Techno Main Salt Lake</p>`);
};

// ── 4. Interview Cancellation ─────────────────────────────────────
exports.interviewCancellationTemplate = ({ studentName, companyName, jobTitle, roundName, date, time, reason, portalUrl }) =>
  layout(`
    <p>Dear <strong>${esc(studentName)}</strong>,</p>
    <p>We regret to inform you that your scheduled interview has been <strong style="color:#dc2626">cancelled</strong>.</p>
    ${infoTable([['Job Role', jobTitle], ['Company', companyName], ['Round', roundName], ['Scheduled Date', date], ['Scheduled Time', time], ['Reason', reason || 'Administrative reasons']])}
    <p style="color:#374151;font-size:.9rem">Your application is still active and will be reviewed further. You will be notified of any next steps.</p>
    ${btn('Open Placement Portal', portalUrl)}
    <p style="margin:20px 0 0;color:#6b7280;font-size:.85rem">Regards,<br><strong>Placement Cell</strong><br>Techno Main Salt Lake</p>`);

// ── 5. Round Rejection ────────────────────────────────────────────
exports.roundRejectionTemplate = ({ studentName, companyName, jobTitle, roundNumber, portalUrl }) =>
  layout(`
    <p>Dear <strong>${esc(studentName)}</strong>,</p>
    <p>Thank you for participating in the placement process for <strong>${esc(jobTitle)}</strong> at <strong>${esc(companyName)}</strong>.</p>
    <p>After careful evaluation of Round ${roundNumber} interviews, we regret to inform you that you have <strong style="color:#dc2626">not been shortlisted</strong> for the next round.</p>
    <p style="color:#374151;font-size:.9rem">We appreciate your effort and encourage you to apply for future opportunities. Best of luck in your placement journey!</p>
    ${btn('View Other Opportunities', portalUrl)}
    <p style="margin:20px 0 0;color:#6b7280;font-size:.85rem">Regards,<br><strong>Placement Cell</strong><br>Techno Main Salt Lake</p>`);

// ── 6. Final Result ────────────────────────────────────────────────
exports.finalResultTemplate = ({ studentName, companyName, jobTitle, status, packageLPA, remarks, portalUrl }) => {
  const isSelected = status === 'Selected';
  const header = isSelected
    ? `<p>🎉 Congratulations <strong>${esc(studentName)}</strong>!</p>
       <p>You have been <strong style="color:#16a34a">SELECTED</strong> for <strong>${esc(jobTitle)}</strong> at <strong>${esc(companyName)}</strong>.</p>`
    : `<p>Dear <strong>${esc(studentName)}</strong>,</p>
       <p>Thank you for your effort in the placement process. After final evaluation, we regret that you were <strong style="color:#dc2626">not selected</strong> for <strong>${esc(jobTitle)}</strong> at <strong>${esc(companyName)}</strong>.</p>`;
  const rows = isSelected
    ? [['Company', companyName], ['Job Role', jobTitle], ['Package', packageLPA || 'As per company norms'], ...(remarks ? [['Remarks', remarks]] : [])]
    : [['Company', companyName], ['Job Role', jobTitle], ...(remarks ? [['Remarks', remarks]] : [])];
  return layout(`${header}${infoTable(rows)}
    ${isSelected ? '<p style="color:#374151;font-size:.9rem">The Placement Cell will share further joining details soon. Congratulations again!</p>' : '<p style="color:#374151;font-size:.9rem">We encourage you to apply for future drives. Best wishes!</p>'}
    ${btn('Open Placement Portal', portalUrl)}
    <p style="margin:20px 0 0;color:#6b7280;font-size:.85rem">Regards,<br><strong>Placement Cell</strong><br>Techno Main Salt Lake</p>`);
};

// ── 7. Company Selection Confirmation ─────────────────────────────
exports.companySelectionTemplate = ({ studentName, companyName, jobTitle, instructions, portalUrl }) =>
  layout(`
    <p>🎉 Congratulations, <strong>${esc(studentName)}</strong>!</p>
    <p>We are delighted to inform you that <strong>${esc(companyName)}</strong> has <strong style="color:#16a34a">selected you</strong> for the position of <strong>${esc(jobTitle)}</strong>.</p>
    ${instructions ? `<h3 style="color:#4f46e5;margin:16px 0 6px">📝 Next Steps / Instructions</h3><p style="color:#374151;font-size:.9rem">${esc(instructions)}</p>` : ''}
    <p style="color:#374151;font-size:.9rem">The Placement Cell will coordinate with you regarding joining formalities. Please check your email regularly.</p>
    ${btn('Open Placement Portal', portalUrl)}
    <p style="margin:20px 0 0;color:#6b7280;font-size:.85rem">Regards,<br><strong>Placement Cell</strong><br>Techno Main Salt Lake</p>`);

// ── sendMail with batching ─────────────────────────────────────────
/**
 * Send a single email. Returns { success, to, error? }.
 */
exports.sendMail = async ({ to, subject, text, html }) => {
  if (!enabled()) {
    console.log('Email disabled – skipping:', to);
    return { success: false, to, error: 'Email service disabled' };
  }
  try {
    const info = await getTransport().sendMail({
      from: process.env.EMAIL_FROM || `"Placement Cell" <${process.env.SMTP_USER}>`,
      to, subject, text, html,
    });
    return { success: true, to, messageId: info.messageId };
  } catch (err) {
    console.error('sendMail failed:', to, err.message);
    return { success: false, to, error: err.message };
  }
};

/**
 * Send emails in controlled batches (default 5/batch, 1200ms delay).
 * Returns array of { success, to, error? }.
 */
exports.sendMailBatch = async (messages, { batchSize = 5, delayMs = 1200 } = {}) => {
  const results = [];
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(exports.sendMail));
    results.push(...batchResults);
    if (i + batchSize < messages.length) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
>>>>>>> Stashed changes
};
