const jwt = require('jsonwebtoken');

// 1. Define 'authenticate' (Make sure the name is exactly this)
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

// 2. Define 'authorize'
const authorize = (roles) => {
  return (req, res, next) => {
    // Note: ensure your JWT payload uses 'account_type'
    if (!roles.includes(req.user.account_type)) {
      return res.status(403).json({
        message: 'Forbidden: You do not have access to this resource'
      });
    }
    next();
  };
};

// 3. Export them (Names must match the 'const' names above)
module.exports = {
  authenticate,
  authorize
};


