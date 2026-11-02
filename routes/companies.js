const router = require('express').Router();
const Company = require('../models/Company');
const Job = require('../models/Job');
const { protect, authorize } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

router.use(protect);

router.get('/', asyncHandler(async (req, res) => {
  res.json(await Company.find().sort({ name: 1 }));
}));

router.post('/', authorize('admin'), asyncHandler(async (req, res) => {
  res.status(201).json(await Company.create(req.body));
}));

router.put('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  const company = await Company.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!company) return res.status(404).json({ message: 'Company not found' });
  res.json(company);
}));

router.delete('/:id', authorize('admin'), asyncHandler(async (req, res) => {
  if (await Job.exists({ company: req.params.id })) {
    return res.status(400).json({ message: 'Delete this company\'s jobs first' });
  }
  const company = await Company.findByIdAndDelete(req.params.id);
  if (!company) return res.status(404).json({ message: 'Company not found' });
  res.json({ message: 'Company deleted' });
}));

module.exports = router;
