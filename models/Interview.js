const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema(
  {
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
    student:     { type: mongoose.Schema.Types.ObjectId, ref: 'Student',     required: true },
    job:         { type: mongoose.Schema.Types.ObjectId, ref: 'Job',         required: true },
    roundNumber: { type: Number, default: 1, min: 1 },
    roundName:   { type: String, default: 'Technical Interview' },
    date:        { type: Date,   required: [true, 'Interview date is required'] },
    time:        { type: String, required: [true, 'Interview time is required'] },
    mode:        { type: String, enum: ['Online', 'Offline'], default: 'Online' },
    venue:       String,  // meeting link (Online) OR physical address (Offline)
    additionalInstructions: String,
    // Cancellation
    status:            { type: String, enum: ['Scheduled', 'Cancelled'], default: 'Scheduled' },
    cancelledAt:       Date,
    cancellationReason: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Interview', interviewSchema);
