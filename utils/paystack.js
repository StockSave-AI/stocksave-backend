const axios = require('axios');

const paystack = axios.create({
  baseURL: 'https://api.paystack.co',
  headers: {
    Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
    'Content-Type': 'application/json'
  }
});

module.exports = {
  // 1. Initialize: Returns the URL for the user to pay
  initializePayment: async (email, amount) => {
    const res = await paystack.post('/transaction/initialize', {
      email,
      amount: amount * 100 // Paystack uses kobo/cents (Multiply by 100)
    });
    return res.data;
  },

  // 2. Verify: Confirms the payment actually happened
  verifyPayment: async (reference) => {
    const res = await paystack.get(`/transaction/verify/${reference}`);
    return res.data;
  }
};
