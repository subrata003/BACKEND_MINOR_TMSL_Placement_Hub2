/**
 * Bulk Operations Routes
 * POST /api/bulk/assign-round1          - Assign all applied students to Round 1
 * POST /api/bulk/preview-shortlist      - Upload Excel and preview matched students
 * POST /api/bulk/confirm-shortlist      - Confirm and advance shortlisted students to next round
 * GET  /api/bulk/stats/:jobId           - Get round stats for a job
 */

const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const Application = require('../models/Application');
const Student = require('../models/Student');
const Job = require('../models/Job');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const uploadExcel = require('../middleware/uploadExcel');
const notify = require('../utils/notify');

// All bulk routes are admin-only
router.use(protect, authorize('admin'));

// ─────────────────────────────────────────────
// GET /api/bulk/stats/:jobId
// Returns applicant & round stats for a job
// ─────────────────────────────────────────────
router.get('/stats/:jobId', asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const allApps = await Application.find({ job: jobId });
  const totalApplicants = allApps.length;

  // Count per round
  const roundCounts = {};
  allApps.forEach((a) => {
    const r = a.currentRound;
    roundCounts[r] = (roundCounts[r] || 0) + 1;
  });

  // Active (not Rejected/Withdrawn/Selected) per round
  const TERMINAL = ['Rejected', 'Withdrawn', 'Selected'];
  const activeByRound = {};
  allApps.forEach((a) => {
    if (!TERMINAL.includes(a.status)) {
      const r = a.currentRound;
      activeByRound[r] = (activeByRound[r] || 0) + 1;
    }
  });

  const assignedToRound1 = allApps.filter((a) => a.currentRound >= 1).length;
  const maxRound = allApps.reduce((m, a) => Math.max(m, a.currentRound), 0);

  res.json({
    job: { _id: job._id, title: job.title, company: job.company },
    totalApplicants,
    assignedToRound1,
    maxRound,
    roundCounts,
    activeByRound,
  });
}));

// ─────────────────────────────────────────────
// POST /api/bulk/assign-round1
// Body: { jobId }
// Assigns ALL non-terminal, not-yet-round-1 applications to Round 1
// ─────────────────────────────────────────────
router.post('/assign-round1', asyncHandler(async (req, res) => {
  const { jobId } = req.body;
  if (!jobId) return res.status(400).json({ message: 'jobId is required' });

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job) return res.status(404).json({ message: 'Job not found' });

  // Only 'Applied' or 'Under Review' students not yet in any round
  const eligible = await Application.find({
    job: jobId,
    currentRound: 0,
    status: { $in: ['Applied', 'Under Review'] },
  }).populate('student', 'user name rollNumber');

  if (eligible.length === 0) {
    return res.status(200).json({
      message: 'No eligible applications to assign. All students are already assigned or in a terminal state.',
      updated: 0,
    });
  }

  // bulkWrite for efficiency
  const bulkOps = eligible.map((app) => ({
    updateOne: {
      filter: { _id: app._id },
      update: {
        $set: { currentRound: 1, status: 'Shortlisted' },
        $push: {
          history: { status: 'Shortlisted', at: new Date() },
          roundHistory: { round: 1, assignedAt: new Date(), note: 'Bulk assigned to Round 1' },
        },
      },
    },
  }));

  const result = await Application.bulkWrite(bulkOps, { ordered: false });

  // Fire notifications asynchronously (non-blocking)
  eligible.forEach((app) => {
    if (app.student?.user) {
      notify(
        app.student.user,
        'Round 1 Assignment',
        `You have been assigned to Round 1 for ${job.title} at ${job.company.name}. Congratulations!`
      );
    }
  });

  res.json({
    message: `Successfully assigned ${result.modifiedCount} student(s) to Round 1.`,
    updated: result.modifiedCount,
    total: eligible.length,
  });
}));

// ─────────────────────────────────────────────
// POST /api/bulk/preview-shortlist
// Multipart: file (Excel/CSV) + body { jobId, currentRound (number) }
// Returns a preview without writing to DB
// ─────────────────────────────────────────────
router.post('/preview-shortlist', uploadExcel.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Please upload an Excel or CSV file' });

  const { jobId, currentRound } = req.body;
  if (!jobId || currentRound === undefined) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'jobId and currentRound are required' });
  }

  const round = parseInt(currentRound, 10);
  if (isNaN(round) || round < 1) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: 'currentRound must be a positive integer' });
  }

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ message: 'Job not found' });
  }

  // ── Parse Excel / CSV ──
  let rollNumbers = [];
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Try to auto-detect which column contains roll numbers
    // Accept first column, or any column with header matching rollNumber / roll_no / roll no etc.
    let rollCol = 0;
    if (rows.length > 0) {
      const header = rows[0].map((h) => String(h).toLowerCase().replace(/[\s_-]/g, ''));
      const idx = header.findIndex((h) =>
        ['rollno', 'rollnumber', 'roll', 'studentroll', 'enrollmentno'].includes(h)
      );
      rollCol = idx >= 0 ? idx : 0;
    }

    // Collect values, skip header row if it's non-numeric
    rows.forEach((row, i) => {
      const cell = String(row[rollCol] ?? '').trim();
      if (cell && !/^[a-z]/i.test(cell)) rollNumbers.push(cell); // skip text headers
    });
  } catch (err) {
    fs.unlinkSync(req.file.path);
    return res.status(400).json({ message: `Could not parse file: ${err.message}` });
  } finally {
    // Always clean up temp file
    try { fs.unlinkSync(req.file.path); } catch (_) {}
  }

  // ── Deduplicate ──
  const seen = new Set();
  const duplicates = [];
  const unique = [];
  rollNumbers.forEach((r) => {
    if (seen.has(r)) { duplicates.push(r); } else { seen.add(r); unique.push(r); }
  });

  const totalInFile = rollNumbers.length;

  // ── Match students in DB ──
  const students = await Student.find({ rollNumber: { $in: unique } }).select('_id name rollNumber user');
  const foundRollSet = new Set(students.map((s) => s.rollNumber));
  const notFound = unique.filter((r) => !foundRollSet.has(r));

  // ── Find applications for this job ──
  const studentIds = students.map((s) => s._id);
  const applications = await Application.find({ job: jobId, student: { $in: studentIds } })
    .populate('student', 'name rollNumber');

  const appByStudentId = {};
  applications.forEach((a) => { appByStudentId[String(a.student._id)] = a; });

  // Students found in DB but did not apply
  const didNotApply = students
    .filter((s) => !appByStudentId[String(s._id)])
    .map((s) => ({ rollNumber: s.rollNumber, name: s.name }));

  // Among applicants: check round eligibility
  const eligibleApps = [];
  const wrongRound = [];   // in DB but not in the expected current round
  const alreadyProcessed = []; // already in round+1 or beyond

  applications.forEach((app) => {
    const rn = app.student.rollNumber;
    if (app.currentRound === round) {
      eligibleApps.push({
        applicationId: app._id,
        studentId: app.student._id,
        rollNumber: rn,
        name: app.student.name,
        currentRound: app.currentRound,
        status: app.status,
      });
    } else if (app.currentRound > round) {
      alreadyProcessed.push({ rollNumber: rn, name: app.student.name, currentRound: app.currentRound });
    } else {
      wrongRound.push({ rollNumber: rn, name: app.student.name, currentRound: app.currentRound });
    }
  });

  res.json({
    summary: {
      totalInFile,
      uniqueInFile: unique.length,
      duplicates: duplicates.length,
      matched: students.length,
      notFound: notFound.length,
      didNotApply: didNotApply.length,
      wrongRound: wrongRound.length,
      alreadyProcessed: alreadyProcessed.length,
      eligibleToAdvance: eligibleApps.length,
    },
    details: {
      duplicates,
      notFound,
      didNotApply,
      wrongRound,
      alreadyProcessed,
      eligible: eligibleApps,
    },
    meta: {
      jobId,
      jobTitle: job.title,
      company: job.company?.name,
      currentRound: round,
      nextRound: round + 1,
    },
  });
}));

// ─────────────────────────────────────────────
// POST /api/bulk/confirm-shortlist
// Body: { jobId, currentRound, applicationIds: [...] }
// Advances confirmed applicationIds from currentRound → currentRound+1
// ─────────────────────────────────────────────
router.post('/confirm-shortlist', asyncHandler(async (req, res) => {
  const { jobId, currentRound, applicationIds } = req.body;

  if (!jobId || currentRound === undefined || !Array.isArray(applicationIds) || applicationIds.length === 0) {
    return res.status(400).json({ message: 'jobId, currentRound, and applicationIds[] are required' });
  }

  const round = parseInt(currentRound, 10);
  if (isNaN(round) || round < 1) return res.status(400).json({ message: 'currentRound must be a positive integer' });

  const job = await Job.findById(jobId).populate('company', 'name');
  if (!job) return res.status(404).json({ message: 'Job not found' });

  const nextRound = round + 1;

  // Validate: only advance apps that are in the correct round and not terminal
  const TERMINAL = ['Rejected', 'Withdrawn', 'Selected'];
  const apps = await Application.find({
    _id: { $in: applicationIds },
    job: jobId,
    currentRound: round,
    status: { $nin: TERMINAL },
  }).populate('student', 'user name rollNumber');

  if (apps.length === 0) {
    return res.status(400).json({
      message: 'No valid applications found to advance. They may already be processed or not in the expected round.',
    });
  }

  // bulkWrite
  const bulkOps = apps.map((app) => ({
    updateOne: {
      filter: { _id: app._id },
      update: {
        $set: { currentRound: nextRound, status: 'Shortlisted' },
        $push: {
          history: { status: 'Shortlisted', at: new Date() },
          roundHistory: {
            round: nextRound,
            assignedAt: new Date(),
            note: `Advanced from Round ${round} to Round ${nextRound} via Excel import`,
          },
        },
      },
    },
  }));

  const result = await Application.bulkWrite(bulkOps, { ordered: false });

  // Notify students
  apps.forEach((app) => {
    if (app.student?.user) {
      notify(
        app.student.user,
        `Shortlisted for Round ${nextRound}`,
        `Congratulations! You have been shortlisted for Round ${nextRound} of ${job.title} at ${job.company.name}.`
      );
    }
  });

  res.json({
    message: `Successfully advanced ${result.modifiedCount} student(s) to Round ${nextRound}.`,
    updated: result.modifiedCount,
    nextRound,
  });
}));

module.exports = router;
