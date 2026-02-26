const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const validator = require('validator');
const User = require('../models/userModel');
const { validatePassword } = require('../utils/validator');
const db = require('../configs/connect');

const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

exports.signup = async (req, res) => {
  const { first_name, last_name, email, phone, password, account_type } = req.body;
  try {
    if (!validator.isEmail(email)) return res.status(400).json({ message: "Invalid email format" });

    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const existingUser = await User.findByEmail(email);
    if (existingUser) return res.status(400).json({ message: "Email already registered or account inactive" });

    const password_hash = await bcrypt.hash(password, 12);
    await User.createUser({ first_name, last_name, email, phone, password_hash, account_type });

    res.status(201).json({ message: "Account created successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error during signup" });
  }
};

exports.login = async (req, res) => {
  const { email, password, remember_me } = req.body; // ← add remember_me

  try {
    const user = await User.findByEmail(email);
    if (!user) return res.status(400).json({ message: "Invalid credentials or account inactive" });

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    // ← Remember Me = 30 days, otherwise 1 day
    const expiresIn = remember_me ? '30d' : '1d';

    const token = jwt.sign(
      { id: user.id, email: user.email, account_type: user.account_type },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    res.status(200).json({ 
      message: "Login successful", 
      token,
      expires_in: expiresIn // ← tells frontend how long token lasts
    });
  } catch (error) {
    res.status(500).json({ message: "Server error during login" });
  }
};

exports.requestPasswordReset = async (req, res) => {
  const { phone } = req.body;
  try {
    const user = await User.findByPhone(phone);
    if (!user) return res.status(404).json({ message: "Active user not found with this phone number" });

    await twilio.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verifications.create({ to: phone, channel: 'sms' });

    res.status(200).json({ status: 'success', message: 'OTP sent via Twilio' });
  } catch (err) {
    res.status(500).json({ message: 'Twilio failed to send SMS' });
  }
};

exports.resetPassword = async (req, res) => {
  const { phone, otp, newPassword } = req.body;
  try {
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ message: passwordError });

    const check = await twilio.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks.create({ to: phone, code: otp });

    if (check.status !== 'approved') return res.status(400).json({ message: 'Invalid or expired OTP' });

    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await User.updatePassword(phone, newPasswordHash);

    res.status(200).json({ status: 'success', message: 'Password updated!' });
  } catch (err) {
    res.status(500).json({ message: 'Verification failed' });
  }
};

// GET /api/auth/me - Returns logged in user's profile
exports.getAccountSummary = async (req, res) => {
  try {
    const userId = req.user.id;
    const [rows] = await db.execute(
      'SELECT id, first_name, last_name, email, phone, account_type, status, balance, created_at FROM users WHERE id = ?',
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({
      status: 'success',
      data: rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch account: " + error.message });
  }
};

exports.deleteAccount = async (req, res) => {
  try {
    const [result] = await User.deactivate(req.user.id);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found' });

    res.status(200).json({ message: 'Account deactivated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Deactivation failed' });
  }
};