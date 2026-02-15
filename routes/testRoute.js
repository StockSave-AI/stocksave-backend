const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');

// Accessible to any logged-in user
router.get('/dashboard', authenticate, (req, res) => {
  res.json({
    message: 'Welcome to your dashboard',
    user: req.user
  });
});

// Only Owners
router.get('/owner-only', authenticate, authorize(['Owner']), (req, res) => {
  res.json({
    message: 'Welcome Owner'
  });
});

// Only Customers
router.get('/customer-only', authenticate, authorize(['Customer']), (req, res) => {
  res.json({
    message: 'Welcome Customer'
  });
});

module.exports = router;
