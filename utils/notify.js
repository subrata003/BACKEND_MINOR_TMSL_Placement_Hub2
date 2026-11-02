const Notification = require('../models/Notification');

module.exports = (user, title, message) =>
  Notification.create({ user, title, message }).catch((e) => console.error('notify failed', e.message));
