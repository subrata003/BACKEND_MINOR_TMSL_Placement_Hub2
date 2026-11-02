const norm = (v) => String(v || '').trim().toLowerCase();

// Compares a student's academic details against a job's criteria.
// Returns { eligible: boolean, reasons: string[] }
exports.checkEligibility = (student, job) => {
  const e = job.eligibility || {};
  const reasons = [];

  if (e.minCgpa && (student.cgpa == null || student.cgpa < e.minCgpa)) {
    reasons.push(`Minimum CGPA ${e.minCgpa} required`);
  }
  if (e.minPercentage && (student.percentage == null || student.percentage < e.minPercentage)) {
    reasons.push(`Minimum ${e.minPercentage}% required`);
  }
  if (e.degrees?.length && !e.degrees.map(norm).includes(norm(student.degree))) {
    reasons.push(`Open to degrees: ${e.degrees.join(', ')}`);
  }
  if (e.branches?.length && !e.branches.map(norm).includes(norm(student.department))) {
    reasons.push(`Open to branches: ${e.branches.join(', ')}`);
  }
  if (e.maxBacklogs != null && (student.backlogs || 0) > e.maxBacklogs) {
    reasons.push(`Maximum ${e.maxBacklogs} backlog(s) allowed`);
  }
  if (e.passingYear && student.passingYear !== e.passingYear) {
    reasons.push(`Only for ${e.passingYear} batch`);
  }
  return { eligible: reasons.length === 0, reasons };
};

// Fields a student must fill before applying
exports.missingProfileFields = (student) => {
  const required = ['department', 'degree', 'passingYear', 'cgpa', 'percentage'];
  const missing = required.filter((f) => student[f] === undefined || student[f] === null || student[f] === '');
  if (!student.resume) missing.push('resume');
  return missing;
};
