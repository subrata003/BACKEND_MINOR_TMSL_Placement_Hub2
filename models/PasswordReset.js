const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },

    otpHash: {
      type: String,
      required: true
    },

    otpExpires: {
      type: Date,
      required: true
    },

    otpAttempts: {
      type: Number,
      default: 0
    },

    resetTokenHash: {
      type: String,
      default: null
    },

    resetTokenExpires: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PasswordReset", passwordResetSchema);