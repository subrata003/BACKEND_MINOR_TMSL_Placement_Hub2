const mongoose = require('mongoose');

const otpVerificationSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  otpHash: {
    type: String,
    required: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    expires: 0,
  },
  attempts: {
    type: Number,
    default: 0,
  },
});

module.exports = mongoose.model(
  'OtpVerification',
  otpVerificationSchema
);