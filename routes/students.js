const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const Student = require('../models/Student');
const User = require('../models/User');
const Application = require('../models/Application');
const Interview = require('../models/Interview');
const Result = require('../models/Result');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const asyncHandler = require('../utils/asyncHandler');

router.use(protect);

const EDITABLE = ['name', 'rollNo', 'phone', 'department', 'degree', 'passingYear', 'cgpa', 'percentage', 'tenthPercentage', 'twelfthPercentage', 'backlogs'];
const NUMERIC = ['passingYear', 'cgpa', 'percentage', 'tenthPercentage', 'twelfthPercentage', 'backlogs'];

// ---------- Student: own profile ----------
router.get('/me', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id }).populate('user', 'email');
  if (!student) return res.status(404).json({ message: 'Profile not found' });
  res.json(student);
}));

router.put('/me', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  if (!student) return res.status(404).json({ message: 'Profile not found' });
  for (const f of EDITABLE) {
    if (req.body[f] === undefined) continue;
    const v = req.body[f];
    student[f] = NUMERIC.includes(f) ? (v === '' || v === null ? undefined : Number(v)) : v;
  }
  await student.save();
  res.json(student);
}));

router.post('/me/resume', authorize('student'), upload.single('resume'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Please attach a PDF file' });
  const student = await Student.findOne({ user: req.user._id });
  if (student.resume) {
    fs.unlink(path.join(__dirname, '..', student.resume), () => {}); // remove old file
  }
  student.resume = `/uploads/resumes/${req.file.filename}`;
  await student.save();
  res.json(student);
}));

// ---------- Admin: manage students ----------
// Search + filters: ?search=&department=&passingYear=&minCgpa=&placementStatus=&page=&limit=
router.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { search, department, passingYear, minCgpa, placementStatus } = req.query;
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const q = {};
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    q.$or = [{ name: rx }, { rollNo: rx }];
  }
  if (department) q.department = new RegExp(`^${department.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  if (passingYear) q.passingYear = Number(passingYear);
  if (minCgpa) q.cgpa = { $gte: Number(minCgpa) };
  if (placementStatus) q.placementStatus = placementStatus;

  const [students, total] = await Promise.all([
    Student.find(q).populate('user', 'email').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Student.countDocuments(q),
  ]);
  res.json({ students, total, page, pages: Math.ceil(total / limit) });
}));

router.get('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id).populate('user', 'email');
  if (!student) return res.status(404).json({ message: 'Student not found' });
  res.json(student);
}));

router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const student = await Student.findById(req.params.id);
  if (!student) return res.status(404).json({ message: 'Student not found' });
  if (student.resume) fs.unlink(path.join(__dirname, '..', student.resume), () => {});
  await Promise.all([
    Application.deleteMany({ student: student._id }),
    Interview.deleteMany({ student: student._id }),
    Result.deleteMany({ student: student._id }),
    Notification.deleteMany({ user: student.user }),
  ]);
  await User.findByIdAndDelete(student.user);
  await student.deleteOne();
  res.json({ message: 'Student removed' });
}));

module.exports = router;
