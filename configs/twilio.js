const twilio = require("twilio");

// Environment variables are highly recommended for security
const accountSid = process.env.TWILIO_ACCOUNT_SID; 
const authToken = process.env.TWILIO_AUTH_TOKEN;
const verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;

const client = twilio(accountSid, authToken);

module.exports = {
  client,
  verifyServiceSid
};
