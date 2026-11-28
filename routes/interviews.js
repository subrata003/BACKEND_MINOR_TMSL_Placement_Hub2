const router = require('express').Router();
const Interview   = require('../models/Interview');
const Application = require('../models/Application');
const Student     = require('../models/Student');
const User        = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const notify       = require('../utils/notify');
const { sendMail, interviewCancellationTemplate } = require('../utils/mailer');

router.use(protect);

const populateJob = { path: 'job', select: 'title company resultDeclared', populate: { path: 'company', select: 'name' } };

// ── Admin: schedule individual interview ─────────────────────────
router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { applicationId, roundNumber, roundName, date, time, mode, venue, additionalInstructions } = req.body;
  const app = await Application.findById(applicationId)
    .populate('student', 'user name')
    .populate({ path: 'job', populate: 'company' });
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (app.job.resultDeclared) return res.status(400).json({ message: 'Final results declared. No scheduling allowed.' });
  if (!['Shortlisted', 'Interview Scheduled'].includes(app.status)) {
    return res.status(400).json({ message: 'Shortlist the candidate before scheduling an interview' });
  }

  const interview = await Interview.create({
    application: app._id, student: app.student._id, job: app.job._id,
    roundNumber, roundName, date, time, mode, venue, additionalInstructions,
  });
  app.status = 'Interview Scheduled';
  await app.save();
  notify(app.student.user, 'Interview Scheduled',
    `${roundName || 'Interview'} for ${app.job.title} at ${app.job.company.name} on ${new Date(date).toDateString()} at ${time}.`);
  res.status(201).json(interview);
}));

// ── Admin: list all interviews ───────────────────────────────────
router.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const q = {};
  if (req.query.job)    q.job    = req.query.job;
  if (req.query.status) q.status = req.query.status;
  const interviews = await Interview.find(q)
    .populate('student', 'name rollNumber')
    .populate(populateJob)
    .sort({ date: 1 });
  res.json(interviews);
}));

// ── Student: my interviews ───────────────────────────────────────
router.get('/my', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  const interviews = await Interview.find({ student: student._id }).populate(populateJob).sort({ date: 1 });
  res.json(interviews);
}));

// ── Admin: cancel interview ──────────────────────────────────────
router.patch('/:id/cancel', authorize('admin'), asyncHandler(async (req, res) => {
  const { reason } = req.body;
  const iv = await Interview.findById(req.params.id)
    .populate({ path: 'student', select: 'user name' })
    .populate({ path: 'application' })
    .populate(populateJob);
  if (!iv) return res.status(404).json({ message: 'Interview not found' });
  if (iv.status === 'Cancelled') return res.status(400).json({ message: 'Interview already cancelled' });

  iv.status = 'Cancelled';
  iv.cancelledAt = new Date();
  iv.cancellationReason = reason || 'Administrative reasons';
  await iv.save();

  // Return application to 'Shortlisted' so admin can reassign
  if (iv.application) {
    await Application.findByIdAndUpdate(iv.application._id, { status: 'Shortlisted' });
  }

  // Notify student
  const displayDate = new Date(iv.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const shortMsg = `Your interview for ${iv.job.title} at ${iv.job.company.name} (${iv.roundName}) has been cancelled. Reason: ${iv.cancellationReason}`;
  notify(iv.student.user, 'Interview Cancelled', shortMsg);

  const userDoc = await User.findById(iv.student.user).select('email');
  if (userDoc?.email) {
    sendMail({
      to: userDoc.email,
      subject: `[Placement Cell] Interview Cancelled — ${iv.job.title}`,
      text: shortMsg,
      html: interviewCancellationTemplate({
        studentName: iv.student.name || 'Student',
        companyName: iv.job.company.name,
        jobTitle:    iv.job.title,
        roundName:   iv.roundName,
        date:        displayDate,
        time:        iv.time,
        reason:      iv.cancellationReason,
        portalUrl:   process.env.CLIENT_URL || 'http://localhost:5173',
      }),
    });
  }

  res.json({ message: 'Interview cancelled and student notified.', interview: iv });
}));

// ── Admin: delete interview (hard) ───────────────────────────────
router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const iv = await Interview.findByIdAndDelete(req.params.id);
  if (!iv) return res.status(404).json({ message: 'Interview not found' });
  res.json({ message: 'Interview deleted' });
}));

module.exports = router;
