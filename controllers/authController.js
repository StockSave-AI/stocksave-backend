const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const validator = require('validator');
const User = require('../models/userModel');
const { validatePassword } = require('../utils/validator');
const termiiConfig = require('../configs/termii');

exports.signup = async (req, res) => {
  const {
    full_name,
    email,
    phone,
    password,
    account_type
  } = req.body;

  try {
    if (!validator.isEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const saltRounds = 12;

    const password_hash = await bcrypt.hash(password, saltRounds);
   

    await User.createUser({
      full_name,
      email,
      phone,
      password_hash,
      account_type
    });

    res.status(201).json({ message: "Account created successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error during signup" });
  }
};


exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findByEmail(email);

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.password_hash);

    if (!match) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
  {
    id: user.id,
    email: user.email,
    account_type: user.account_type // This will now be 'Customer' or 'Owner'
  },
  process.env.JWT_SECRET,
  { expiresIn: '1d' }
);

    res.status(200).json({
      message: "Login successful",
      token
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error during login" });
  }
};


// --- FORGOT PASSWORD (REQUEST OTP) ---
exports.requestPasswordReset = async (req, res) => {
  const { phone } = req.body;
  try {
    const user = await User.findByPhone(phone);
    if (!user) {
      return res.status(404).json({ status: 'error', message: 'User not found' });
    }

   const payload = {
  api_key: termiiConfig.apiKey,
  message_type: "NUMERIC",
  to: phone.replace('+', ''), // Termii prefers no '+'
  from: "N-Alert", 
  channel: "dnd",
  pin_attempts: 3,
  pin_time_to_live: 10,
  pin_length: 6,
  pin_type: "NUMERIC", // Added from your error log
  pin_placeholder: "< 123456 >",
  message_text: "Your StockSave reset code is < 123456 >" // FIXED: changed 'message' to 'message_text'
};



    const response = await axios.post(`${termiiConfig.baseUrl}/api/sms/otp/send`, payload);

    res.status(200).json({ 
      status: 'success', 
      message: 'Reset OTP sent', 
      pinId: response.data.pinId 
    });
  } catch (err) {
    console.error("Termii Error:", err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Failed to send OTP' });
  }
};

// --- RESET PASSWORD (VERIFY OTP) ---
exports.resetPassword = async (req, res) => {
  const { phone, otp, pinId, newPassword } = req.body;
  
  try {
    const verifyPayload = {
      api_key: termiiConfig.apiKey,
      pin_id: pinId,
      pin: otp
    };

    const verification = await axios.post(`${termiiConfig.baseUrl}/api/sms/otp/verify`, verifyPayload);

    if (verification.data.verified !== true) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired OTP' });
    }

    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    await User.updatePassword(phone, newPasswordHash);
    
    res.status(200).json({ status: 'success', message: 'Password updated successfully' });
  } catch (err) {
    console.error("Verification Error:", err.response?.data || err.message);
    res.status(500).json({ status: 'error', message: 'Reset failed' });
  }
};


exports.getAccountSummary = async (req, res) => {
    try {
        const userId = req.user.id;
        const user = await User.findById(userId); // Make sure this model method exists

        if (!user) return res.status(404).json({ message: "User not found" });

        res.status(200).json({
            status: 'success',
            data: {
                full_name: user.full_name,
                balance: user.balance,
                account_type: user.account_type,
                member_since: user.created_at,
                // These would usually come from a JOIN with a bookings table
                active_plans: 1, 
                //***pending_bookings: 2 
            }
        });
    } catch (err) {
        res.status(500).json({ message: "Error fetching summary" });
    }
};

// B. Reset Password after OTP is verified
exports.resetPassword = async (req, res) => {
  const { phone, otp, newPassword } = req.body;
  try {
    const verification = await twilio.verify
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phone, code: otp });

    if (verification.status !== 'approved') {
      return res.status(400).json({ status: 'error', message: 'Invalid OTP' });
    }

    // Update password in DB (Ensure User.updatePassword hashes the new password)
    await User.updatePassword(phone, newPassword);
    res.status(200).json({ status: 'success', message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Reset failed' });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    // req.user.id comes from your 'protect' middleware
    const userId = req.user.id; 
    
    await User.deleteById(userId);
    
    res.status(200).json({ status: 'success', message: 'Account deleted successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Deletion failed' });
  }
};

// B. Reset Password after OTP is verified
exports.resetPassword = async (req, res) => {
  const { phone, otp, newPassword } = req.body;
  try {
    const verification = await twilio.verify
      .services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phone, code: otp });

    if (verification.status !== 'approved') {
      return res.status(400).json({ status: 'error', message: 'Invalid OTP' });
    }

    // NEW: Hash the new password before saving!
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Pass the HASH to the model, not the plain password
    await User.updatePassword(phone, newPasswordHash);
    
    res.status(200).json({ status: 'success', message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: 'Reset failed' });
  }
};
