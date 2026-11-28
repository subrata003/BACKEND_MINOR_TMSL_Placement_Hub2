const Notification = require('../models/Notification');

const User         = require('../models/User');
const { sendMail, template } = require('./mailer');

/**
 * Create in-app notification AND send email (fire-and-forget).
 * @param {ObjectId|string} userId
 * @param {string} title
 * @param {string} message
 */
module.exports = async (userId, title, message) => {
  try {
    Notification.create({ user: userId, title, message }).catch((e) => console.error('notify DB failed', e.message));
    const u = await User.findById(userId).select('email');
    if (u?.email) {
      sendMail({ to: u.email, subject: `[Placement Cell] ${title}`, text: message, html: template(title, message) });
    }
  } catch (e) {
    console.error('notify failed:', e.message);
  }
};

