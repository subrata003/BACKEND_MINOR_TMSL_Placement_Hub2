const router = require('express').Router();
const Result  = require('../models/Result');
const Application = require('../models/Application');
const Student = require('../models/Student');
const Job     = require('../models/Job');
const User    = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const notify = require('../utils/notify');
const { sendMail, finalResultTemplate } = require('../utils/mailer');

router.use(protect);

const populateJob = { path: 'job', select: 'title package company resultDeclared', populate: { path: 'company', select: 'name' } };

// ── Admin: declare individual result ─────────────────────────────
router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  const { applicationId, status, remarks } = req.body;
  if (!['Selected', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Result must be Selected or Rejected' });
  }
  const app = await Application.findById(applicationId)
    .populate('student')
    .populate({ path: 'job', populate: 'company' });
  if (!app) return res.status(404).json({ message: 'Application not found' });
  if (app.status === 'Withdrawn') return res.status(400).json({ message: 'Application was withdrawn' });
  if (app.job.resultDeclared) return res.status(400).json({ message: 'Final results declared. No further changes.' });

  if (status === 'Selected' && !['Shortlisted', 'Interview Scheduled', 'Selected'].includes(app.status)) {
    return res.status(400).json({ message: 'Only shortlisted / interviewed candidates can be selected' });
  }

  const pkg = req.body.package !== undefined && req.body.package !== '' ? Number(req.body.package) : app.job.package;
  const result = await Result.findOneAndUpdate(
    { application: app._id },
    { application: app._id, student: app.student._id, job: app.job._id, status, package: status === 'Selected' ? pkg : undefined, remarks, declaredBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );

  app.status = status;
  await app.save();

  if (status === 'Selected') {
    await Student.findByIdAndUpdate(app.student._id, {
      placementStatus: 'Placed', placedCompany: app.job.company.name, placedPackage: pkg,
    });
  }

  // Email
  const userDoc = await User.findById(app.student.user).select('email');
  const portalUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const msg = status === 'Selected'
    ? `Congratulations! You have been selected by ${app.job.company.name} for ${app.job.title}.`
    : `Thank you for applying to ${app.job.company.name}. You were not selected this time.`;
  notify(app.student.user, status === 'Selected' ? '🎉 Congratulations! You are Selected' : 'Result Declared', msg);
  if (userDoc?.email) {
    sendMail({
      to: userDoc.email,
      subject: `[Placement Cell] Result — ${app.job.title}`,
      text: msg,
      html: finalResultTemplate({
        studentName: app.student.name,
        companyName: app.job.company.name,
        jobTitle:    app.job.title,
        status,
        packageLPA:  pkg ? `${pkg} LPA` : null,
        remarks,
        portalUrl,
      }),
    });
  }
  res.status(201).json(result);
}));

// ── Admin: declare BULK final results for a job and lock it ───────
router.post('/declare-final', authorize('admin'), asyncHandler(async (req, res) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ message: 'jobId is required' });

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job) return res.status(404).json({ message: 'Job not found' });
  if (job.resultDeclared) return res.status(400).json({ message: 'Results already declared for this job.' });

  // Lock job
  job.resultDeclared    = true;
  job.resultDeclaredAt  = new Date();
  job.resultDeclaredBy  = req.user._id;
  job.status = 'Closed';
  await job.save();

  res.json({
    message: `Final results declared for ${job.company.name} — ${job.title}. Job is now locked.`,
    jobId,
    declaredAt: job.resultDeclaredAt,
  });
}));

// ── Admin: list all results ───────────────────────────────────────
router.get('/', authorize('admin'), asyncHandler(async (req, res) => {
  const results = await Result.find()
    .populate('student', 'name rollNumber department')
    .populate(populateJob)
    .sort({ createdAt: -1 });
  res.json(results);
}));

// ── Student: my results ───────────────────────────────────────────
router.get('/my', authorize('student'), asyncHandler(async (req, res) => {
  const student = await Student.findOne({ user: req.user._id });
  res.json(await Result.find({ student: student._id }).populate(populateJob).sort({ createdAt: -1 }));
}));

module.exports = router;
