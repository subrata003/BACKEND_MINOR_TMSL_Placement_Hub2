const router = require('express').Router();
const transporter = require("../utils/mailer_test");
const crypto = require("crypto");
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { sendMail, template } = require('../utils/mailer');

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const OtpVerification = require('../models/OtpVerification');

const PasswordReset = require("../models/PasswordReset");
const emailTemplate = require("../utils/emailTemplate");


const sign = (user) =>
  jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

const payload = (user) => ({ id: user._id, email: user.email, role: user.role });

// Student registration (admins are created via `npm run seed`)

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, rollNumber } = req.body;

  // 1. Validate required fields
  if (!name || !email || !password || !rollNumber) {
    return res.status(400).json({
      message: 'Name, email, password and roll number are required'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      message: 'Password must be at least 6 characters'
    });
  }

  const normalizedEmail = email.toLowerCase().trim();
  const normalizedRollNumber = rollNumber.trim();

  // 2. Check existing email
  const existingUser = await User.findOne({
    email: normalizedEmail
  });

  if (existingUser) {
    return res.status(409).json({
      message: 'Email already registered'
    });
  }

  // 3. Check existing roll number
  const existingStudent = await Student.findOne({
    rollNumber: normalizedRollNumber
  });

  if (existingStudent) {
    return res.status(409).json({
      message: 'Roll number already registered'
    });
  }

  // 4. Generate 6-digit OTP
  const otp = crypto.randomInt(100000, 1000000).toString();

  // 5. Hash OTP
  const otpHash = await bcrypt.hash(otp, 10);

  let user;

  try {
    // 6. Create unverified user
    // Password is automatically hashed by User pre-save middleware
    user = await User.create({
      email: normalizedEmail,
      password,
      role: 'student',
      isVerified: false
    });

    // 7. Create student record
    await Student.create({
      user: user._id,
      name: name.trim(),
      rollNumber: normalizedRollNumber
    });

    // 8. Save OTP with 5-minute expiry
    await OtpVerification.findOneAndUpdate(
      { email: normalizedEmail },
      {
        email: normalizedEmail,
        otpHash,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0
      },
      { upsert: true, new: true }
    );

    // 9. Send OTP email
    await sendMail({
      to: normalizedEmail,
      subject: 'Campus Placement Portal - Email Verification',

      text: `Hi ${name}, your OTP is ${otp}. It is valid for 5 minutes.`,

      html: template(
        `Welcome, ${name}!`,
        `Your email verification OTP is <h2>${otp}</h2>
         <p>This OTP is valid for 5 minutes.</p>
         <p>Please do not share it with anyone.</p>`
      )
    });

  } catch (error) {

    // Rollback incomplete registration
    await OtpVerification.deleteOne({
      email: normalizedEmail
    });

    if (user) {
      await Student.deleteOne({ user: user._id });
      await User.findByIdAndDelete(user._id);
    }

    throw error;
  }

  // 10. Return response (NO JWT YET)
  res.status(201).json({
    success: true,
    message: 'Registration successful. OTP sent to your email.',
    email: normalizedEmail
  });

}));


router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required' });
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }
  if (!user.isVerified) {
    return res.status(403).json({
      message: 'Please verify your email before logging in'
    });
  }
  res.json({ token: sign(user), user: payload(user) });
}));


router.post('/verify-otp', asyncHandler(async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      message: 'Email and OTP are required'
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const otpRecord = await OtpVerification.findOne({
    email: normalizedEmail
  });

  if (!otpRecord) {
    return res.status(404).json({
      message: 'OTP not found or expired'
    });
  }

  // Check expiry
  if (otpRecord.expiresAt <= new Date()) {
    await OtpVerification.deleteOne({
      email: normalizedEmail
    });

    return res.status(400).json({
      message: 'OTP has expired'
    });
  }

  // Check maximum attempts
  if (otpRecord.attempts >= 5) {
    await OtpVerification.deleteOne({
      email: normalizedEmail
    });

    return res.status(429).json({
      message: 'Too many attempts. Request a new OTP.'
    });
  }

  // Verify hashed OTP
  const isValid = await bcrypt.compare(
    String(otp),
    otpRecord.otpHash
  );

  if (!isValid) {
    otpRecord.attempts++;
    await otpRecord.save();

    return res.status(401).json({
      message: 'Invalid OTP'
    });
  }

  const user = await User.findOne({
    email: normalizedEmail
  });

  if (!user) {
    return res.status(404).json({
      message: 'User not found'
    });
  }

  user.isVerified = true;
  await user.save();

  await OtpVerification.deleteOne({
    email: normalizedEmail
  });

  res.status(200).json({
    success: true,
    message: 'Email verified successfully',
    token: sign(user),
    user: payload(user)
  });
}));



router.post('/resend-otp', asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      message: 'Email is required'
    });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check whether user exists
  const user = await User.findOne({
    email: normalizedEmail
  });

  if (!user) {
    return res.status(404).json({
      message: 'User not found'
    });
  }

  if (user.isVerified) {
    return res.status(400).json({
      message: 'Email is already verified'
    });
  }

  // Generate new OTP
  const otp = crypto.randomInt(100000, 1000000).toString();

  // Hash OTP
  const otpHash = await bcrypt.hash(otp, 10);

  // Store new OTP with 5-minute expiry
  await OtpVerification.findOneAndUpdate(
    { email: normalizedEmail },
    {
      email: normalizedEmail,
      otpHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0
    },
    { upsert: true, new: true }
  );

  // Send new OTP
  await sendMail({
    to: normalizedEmail,
    subject: 'Campus Placement Portal - New OTP',

    text: `Your new OTP is ${otp}. It is valid for 5 minutes.`,

    html: template(
      'Email Verification',
      `<h2>${otp}</h2>
       <p>Your new OTP is valid for 5 minutes.</p>
       <p>Please do not share it with anyone.</p>`
    )
  });

  res.status(200).json({
    success: true,
    message: 'A new OTP has been sent to your email.'
  });
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
