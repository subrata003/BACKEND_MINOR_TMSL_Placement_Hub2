const router = require('express').Router();
const transporter = require("../utils/mailer_test");
const crypto = require("crypto");
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { sendMail, template } = require('../utils/mailer');
const PasswordReset = require("../models/PasswordReset");
const emailTemplate = require("../utils/emailTemplate");

const sign = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const payload = (user) => ({ id: user._id, email: user.email, role: user.role });

// Student registration (admins are created via `npm run seed`)
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, rollNumber } = req.body;

  if (!name || !email || !password || !rollNumber) {
    return res.status(400).json({
      message: 'Name, email, password and roll number are required'
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({
    email: normalizedEmail
  });

  if (existingUser) {
    return res.status(409).json({
      message: 'Email already registered'
    });
  }

  const existingStudent = await Student.findOne({
    rollNumber: rollNumber.trim()
  });

  if (existingStudent) {
    return res.status(409).json({
      message: 'Roll number already registered'
    });
  }

  const user = await User.create({
    email: normalizedEmail,
    password,
    role: 'student'
  });

  try {
    await Student.create({
      user: user._id,
      name: name.trim(),
      rollNumber: rollNumber.trim()
    });
  } catch (error) {
    await User.findByIdAndDelete(user._id);
    throw error;
  }
  sendMail({
    to: user.email,
    subject: 'Welcome to the Campus Placement Portal',
    text: `Hi ${name}, your account is ready. Complete your profile and upload your resume to start applying.`,
    html: template(`Welcome, ${name}!`, 'Your account is ready. Complete your profile and upload your resume to start applying for placement drives.'),

  })

  res.status(201).json({
    token: sign(user),
    user: payload(user)
  });
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  res.json({ token: sign(user), user: payload(user) });
}));

router.get('/me', protect, (req, res) => res.json({ user: payload(req.user) }));

// forget password part

router.post("/forgot-password", asyncHandler(async (req, res) => {
  const email = req.body.email.trim().toLowerCase();

  const user = await User.findOne({ email });

  if (!user) {
    return res.json({
      message: "If the account exists, an OTP will be sent."
    });
  }

  const otp = crypto.randomInt(100000, 1000000).toString();

  const otpHash = crypto
    .createHmac("sha256", process.env.RESET_OTP_SECRET)
    .update(otp)
    .digest("hex");

  await PasswordReset.findOneAndUpdate(
    { user: user._id },
    {
      otpHash,
      otpExpires: Date.now() + 5 * 60 * 1000,
      otpAttempts: 0,
      resetTokenHash: null,
      resetTokenExpires: null
    },
    { upsert: true, new: true, runValidators: true }
  );

  await transporter.sendMail({
  from: process.env.EMAIL_USER,
  to: user.email,
  subject: "Placement Hub - Password Reset OTP",

  html: emailTemplate.template(
    "Reset Your Password",
    `
      <p>You requested to reset your Placement Hub account password.</p>

      <p>Your One-Time Password (OTP) is:</p>

      <div style="background:#eef2ff;padding:15px;text-align:center;border-radius:8px;margin:15px 0">
        <h1 style="color:#4f46e5;letter-spacing:8px;margin:0">
          ${otp}
        </h1>
      </div>

      <p>This OTP is valid for <b>5 minutes</b>.</p>

      <p>If you did not request a password reset, please ignore this email.</p>
    `
  )
});

res.json({
  message: "If the account exists, an OTP will be sent."
});
}));

// reset-password 

router.post("/reset-password", asyncHandler(async (req, res) => {

    const { email, otp, newPassword, confirmPassword } = req.body;

    if (!email || !otp || !newPassword || !confirmPassword) {
        return res.status(400).json({
            message: "All fields are required"
        });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({
            message: "Passwords do not match"
        });
    }

    if (newPassword.length < 8) {
        return res.status(400).json({
            message: "Password must be at least 8 characters"
        });
    }

    // Find user
    const user = await User.findOne({
        email: email.trim().toLowerCase()
    });

    if (!user) {
        return res.status(400).json({
            message: "Invalid reset request"
        });
    }

    // Find password reset record
    const reset = await PasswordReset.findOne({
        user: user._id
    });

    if (!reset || !reset.otpHash || !reset.otpExpires) {
        return res.status(400).json({
            message: "Invalid or expired OTP"
        });
    }

    // Check OTP expiry
    if (reset.otpExpires <= Date.now()) {
        return res.status(400).json({
            message: "OTP expired"
        });
    }

    // Check maximum attempts
    if (reset.otpAttempts >= 5) {
        return res.status(429).json({
            message: "Too many attempts"
        });
    }

    // Hash entered OTP
    const enteredHash = crypto
        .createHmac("sha256", process.env.RESET_OTP_SECRET)
        .update(otp)
        .digest("hex");

    // Verify OTP safely
    const valid = crypto.timingSafeEqual(
        Buffer.from(enteredHash, "hex"),
        Buffer.from(reset.otpHash, "hex")
    );

    if (!valid) {
        reset.otpAttempts += 1;
        await reset.save();

        return res.status(400).json({
            message: "Incorrect OTP"
        });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Delete OTP reset record
    await PasswordReset.deleteOne({
        _id: reset._id
    });

    res.json({
        message: "Password reset successfully"
    });


}));



module.exports = router;
