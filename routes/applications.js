const router = require('express').Router();
const Application = require('../models/Application');
const Student = require('../models/Student');
const Job = require('../models/Job');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const notify = require('../utils/notify');
const { checkEligibility, missingProfileFields } = require('../utils/eligibility');

router.use(protect);

const FINAL = ['Selected', 'Rejected', 'Withdrawn'];

// ---------- Student ----------
router.post('/', authorize('student'), asyncHandler(async (req, res) => {
  const { jobId } = req.body;
  const [student, job] = await Promise.all([
    Student.findOne({ user: req.user._id }),
    Job.findById(jobId).populate('company', 'name'),
  ]);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  if (job.status !== 'Open') return res.status(400).json({ message: 'This drive is closed' });
  if (new Date(job.deadline) < new Date()) return res.status(400).json({ message: 'Application deadline has passed' });

  const missing = missingProfileFields(student);
  if (missing.length) {
    return res.status(400).json({ message: `Complete your profile first. Missing: ${missing.join(', ')}` });
  }
  const { eligible, reasons } = checkEligibility(student, job);
  if (!eligible) return res.status(403).json({ message: `Not eligible: ${reasons.join('; ')}` });

  // Unique index (student + job) blocks duplicates; check first for a friendly message
  if (await Application.exists({ student: student._id, job: job._id })) {
    return res.status(409).json({ message: 'You have already applied for this job' });
  }
  const application = await Application.create({ student: student._id, job: job._id });
  notify(req.user._id, 'Application submitted', `You applied to ${job.title} at ${job.company.name}.`);
  res.status(201).json(application);
}));

router.get('/my', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const apps = await Application.find({ student: student._id })
    .populate({ path: 'job', select: 'title package deadline company', populate: { path: 'company', select: 'name' } })
    .sort({ createdAt: -1 });
  res.json(apps);
}));

router.patch('/:id/withdraw', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const app = await Application.findOne({ _id: req.params.id, student: student._id });
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (FINAL.includes(app.status)) return res.status(400).json({ message: `Cannot withdraw: application is ${app.status}` });
  app.status = 'Withdrawn';
  await app.save();
  res.json(app);
}));

// ---------- Admin ----------
// ?job=&status=&search=
router.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.job) q.job = req.query.job;
  if (req.query.status) q.status = req.query.status;
  const apps = await Application.find(q)
    .populate('student', 'name rollNo department degree cgpa percentage backlogs resume placementStatus user')
    .populate({ path: 'job', select: 'title package company', populate: { path: 'company', select: 'name' } })
    .sort({ createdAt: -1 });
  res.json(apps);
}));

// Shortlisting / review. Interview + final result have their own endpoints.
router.patch('/:id/status', authorize('admin'), asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['Under Review', 'Shortlisted', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status must be Under Review, Shortlisted or Rejected' });
  }
  const app = await Application.findById(req.params.id).populate('student', 'user').populate({ path: 'job', populate: 'company' });
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (FINAL.includes(app.status)) return res.status(400).json({ message: `Application already ${app.status}` });

  app.status = status;
  await app.save();
  notify(app.student.user, `Application ${status}`, `Your application for ${app.job.title} at ${app.job.company.name} is now "${status}".`);
  res.json(app);
}));

module.exports = router;
