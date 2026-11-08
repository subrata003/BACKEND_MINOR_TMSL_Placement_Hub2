const Notification = require('../models/Notification');
const User = require('../models/User');
const { template, sendMail } = require('./mailer');

module.exports = async(user, title, message) =>{
  try {
    Notification.create({ user, title, message });
  const u=await User.findById(user).select('email');
  if(u?.email){
    // send email
    sendMail({ to: u.email, subject: `[Placement Portal] ${title}`, text: message, html: template(title, message) });
  }
    
  } catch (error) {
    console.error('notify failed:', error.message);
    
  }
  

}
  // Notification.create({ user, title, message }).catch((e) => console.error('notify failed', e.message));
