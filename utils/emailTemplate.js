const esc = (value = "") =>
  String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);

exports.template = (title, message) => `
<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">

  <div style="background:#4f46e5;color:#fff;padding:16px 20px;font-size:18px;font-weight:bold">
    Placement Hub
  </div>

  <div style="padding:20px;color:#1f2937">

    <h2 style="margin:0 0 12px;font-size:18px">
      ${esc(title)}
    </h2>

    <p style="margin:0 0 16px;line-height:1.5">
      ${message}
    </p>

    <a href="${esc(process.env.CLIENT_URL || 'http://localhost:5173')}"
       style="background:#4f46e5;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;display:inline-block">
       Open portal
    </a>

  </div>

  <div style="background:#f9fafb;color:#6b7280;padding:10px 20px;font-size:12px">
    This is an automated message. Please do not reply.
  </div>

</div>`;