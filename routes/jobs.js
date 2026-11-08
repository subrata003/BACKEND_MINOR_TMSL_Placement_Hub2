const router = require('express').Router();
const Job = require('../models/Job');
const Student = require('../models/Student');
const Application = require('../models/Application');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { checkEligibility } = require('../utils/eligibility');
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
      }
    }
  } catch (e) {
    console.error('notifyEligibleStudents failed:', e.message);
  }
}

router.use(protect);

// Admin: all jobs with application counts.
// Student: open jobs annotated with eligibility, applied flag, deadline state.
router.get('/', asyncHandler(async (req, res) => {
  if (req.user.role === 'admin') {
    const [jobs, counts] = await Promise.all([
      Job.find().populate('company', 'name').sort({ createdAt: -1 }).lean(),
      Application.aggregate([{ $group: { _id: '$job', n: { $sum: 1 } } }]),
    ]);
    const map = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    return res.json(jobs.map((j) => ({ ...j, applicationCount: map[String(j._id)] || 0 })));
  }

  const student = await Student.findOne({ user: req.user._id });
  const [jobs, apps] = await Promise.all([
    Job.find({ status: 'Open' }).populate('company', 'name website industry').sort({ deadline: 1 }).lean(),
    Application.find({ student: student._id }).select('job status').lean(),
  ]);
  const applied = Object.fromEntries(apps.map((a) => [String(a.job), a.status]));
  const now = new Date();
  res.json(
    jobs.map((j) => {
      const { eligible, reasons } = checkEligibility(student, j);
      return {
        ...j,
        eligible,
        reasons,
        applicationStatus: applied[String(j._id)] || null,
        deadlinePassed: new Date(j.deadline) < now,
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
  const job = await Job.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!job) return res.status(404).json({ message: 'Job not found' });
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
