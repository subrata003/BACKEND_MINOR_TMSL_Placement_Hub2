const router = require('express').Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Student = require('../models/Student');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { sendMail, template } = require('../utils/mailer');

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

module.exports = router;
