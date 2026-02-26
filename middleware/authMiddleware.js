const jwt = require('jsonwebtoken');
const User = require('../models/userModel');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user || user.status !== 'Active') {
      return res.status(403).json({ message: 'Account is inactive or does not exist' });
    }

    req.user = { ...decoded, ...user }; // ← only line that changed
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const authorize = (roles) => {
  return (req, res, next) => {
    // roles is an array like ['Owner'] or ['Customer', 'Owner']
    if (!roles.includes(req.user.account_type)) {
      return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authenticate, authorize };
