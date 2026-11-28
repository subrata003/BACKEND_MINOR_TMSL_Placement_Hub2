const router = require('express').Router();
const Job = require('../models/Job');
const Student = require('../models/Student');
const Application = require('../models/Application');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { checkEligibility } = require('../utils/eligibility');
<<<<<<< Updated upstream
const notify = require('../utils/notify');


// Notify (in-app + email) every eligible student about a new drive
async function notifyEligibleStudents(job) {
  try {
    if (job.status !== 'Open') return;
    const students = await Student.find().select('user department degree cgpa percentage backlogs passingYear');
    for (const s of students) {
      if (checkEligibility(s, job).eligible) {
        notify(s.user, 'New placement drive',
          `${job.company.name} is hiring for ${job.title}. Apply before ${new Date(job.deadline).toDateString()}.`);
=======
const { expireJobs } = require('../utils/deadlineGuard');
const notify = require('../utils/notify');
const { sendMail, jobAnnouncementTemplate } = require('../utils/mailer');
const User = require('../models/User');

// Auto-notify eligible students (fire-and-forget)
async function notifyEligibleStudents(job) {
  try {
    if (job.status !== 'Open') return;
    const students = await Student.find()
      .select('user name department degree cgpa percentage backlogs passingYear placementStatus');
    const portalUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const deadline  = new Date(job.deadline).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    for (const s of students) {
      if (s.placementStatus === 'Placed') continue;
      if (!checkEligibility(s, job).eligible) continue;

      const msg = `${job.company.name} is hiring for ${job.title}. Apply before ${deadline}.`;
      notify(s.user, 'New Placement Drive', msg);

      const userDoc = await User.findById(s.user).select('email');
      if (userDoc?.email) {
        sendMail({
          to: userDoc.email,
          subject: `[Placement Cell] New Drive: ${job.company.name} — ${job.title}`,
          text: msg,
          html: jobAnnouncementTemplate({
            studentName: s.name || 'Student',
            companyName: job.company.name,
            jobTitle:    job.title,
            jobType:     job.jobType || 'Full-time',
            location:    job.location || 'TBA',
            packageLPA:  job.package ? `${job.package} LPA` : 'As per company norms',
            deadline,
            portalUrl,
          }),
        });
>>>>>>> Stashed changes
      }
    }
  } catch (e) {
    console.error('notifyEligibleStudents failed:', e.message);
  }
}

router.use(protect);

// GET /api/jobs — Admin: all jobs with counts | Student: open eligible jobs
router.get('/', asyncHandler(async (req, res) => {
  // Auto-expire overdue jobs before returning list
  await expireJobs();

  if (req.user.role === 'admin') {
    const [jobs, counts] = await Promise.all([
      Job.find().populate('company', 'name').sort({ createdAt: -1 }).lean(),
      Application.aggregate([{ $group: { _id: '$job', n: { $sum: 1 } } }]),
    ]);
    const map = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    return res.json(jobs.map((j) => ({ ...j, applicationCount: map[String(j._id)] || 0 })));
  }

  // Student view
  const student = await Student.findOne({ user: req.user._id });
  const [jobs, apps] = await Promise.all([
    Job.find({ status: { $in: ['Open', 'Expired'] } }).populate('company', 'name website industry').sort({ deadline: 1 }).lean(),
    Application.find({ student: student._id }).select('job status').lean(),
  ]);
  const applied = Object.fromEntries(apps.map((a) => [String(a.job), a.status]));
  const now = new Date();
  res.json(
    jobs.map((j) => {
      const { eligible, reasons } = checkEligibility(student, j);
      const deadlinePassed = new Date(j.deadline) < now;
      return {
        ...j,
        eligible,
        reasons,
        applicationStatus: applied[String(j._id)] || null,
        deadlinePassed,
        isExpired: j.status === 'Expired' || deadlinePassed,
      };
    })
  );
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const job = await Job.findById(req.params.id).populate('company');
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json(job);
}));

router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  const job = await Job.create(req.body);
  const populated = await job.populate('company', 'name');
  notifyEligibleStudents(populated); // fire-and-forget
  res.status(201).json(populated);
}));

router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  // Don't allow reopening a result-declared job via this route
  const existing = await Job.findById(req.params.id);
  if (!existing) return res.status(404).json({ message: 'Job not found' });
  if (existing.resultDeclared && req.body.status === 'Open') {
    return res.status(400).json({ message: 'Final results have been declared. This job is locked.' });
  }
  const job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  res.json(job);
}));

router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  if (await Application.exists({ job: req.params.id })) {
    return res.status(400).json({ message: 'Job has applications — close it instead of deleting' });
  }
  const job = await Job.findByIdAndDelete(req.params.id);
  if (!job) return res.status(404).json({ message: 'Job not found' });
  res.json({ message: 'Job deleted' });
}));

module.exports = router;
