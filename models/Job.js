const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: [true, 'Company is required'] },
    title: { type: String, required: [true, 'Job title is required'], trim: true },
    description: String,
    jobType: { type: String, enum: ['Full-time', 'Internship', 'Internship + PPO'], default: 'Full-time' },
    location: String,
    package: { type: Number, min: 0 }, // LPA
    eligibility: {
      minCgpa: { type: Number, default: 0 },
      minPercentage: { type: Number, default: 0 },
      maxBacklogs: { type: Number, default: 0 },
      degrees: [String],
      branches: [String],
      passingYear: Number,
    },
    deadline: { type: Date, required: [true, 'Application deadline is required'] },
    // 'Open' = accepting applications, 'Closed' = manually closed, 'Expired' = deadline passed
    status: { type: String, enum: ['Open', 'Closed', 'Expired'], default: 'Open' },
    // Final result lock — prevents further round processing once results declared
    resultDeclared: { type: Boolean, default: false },
    resultDeclaredAt: Date,
    resultDeclaredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Job', jobSchema);
