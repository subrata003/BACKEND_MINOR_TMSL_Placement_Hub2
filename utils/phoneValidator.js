/**
 * phoneValidator.js
 * Indian mobile number: 10 digits starting with 6-9
 */
const INDIAN_PHONE_RE = /^[6-9]\d{9}$/;

exports.isValidPhone = (phone) => {
  if (!phone) return false;
  const cleaned = String(phone).replace(/\s|-/g, '');
  return INDIAN_PHONE_RE.test(cleaned);
};

exports.PHONE_ERROR = 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.';
