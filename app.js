require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Routes
const authRoutes = require('./routes/authRoutes');
const testRoutes = require('./routes/testRoute');
const savingsRoutes = require('./routes/savingRoute');
const inventoryRoutes = require('./routes/inventoryRoutes');
const payoutRoutes = require('./routes/payoutRoute');
const customerRoutes = require('./routes/customerRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const planRoutes = require('./routes/planRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();

// Middleware
app.use(cors()); 
app.use(express.json());

// 1. Define Swagger Options FIRST
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'StockSave API',
      version: '1.1.0',
      description: 'API for User Auth, Savings Management, and Inventory',
    },
    servers: [
      {
        url: 'https://auth-signup.onrender.com',
        description: 'Production Server',
      },
      {
        url: `http://localhost:${process.env.PORT || 3000}`,
        description: 'Local Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        // NEW: Transaction Schema for Savings History/Recent
        Transaction: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 101 },
            amount: { type: 'number', format: 'float', example: 10000.00 },
            method: { type: 'string', enum: ['Cash', 'Paystack', 'Transfer'], example: 'Paystack' },
            status: { type: 'string', enum: ['Pending', 'Completed', 'Failed'], example: 'Completed' },
            reference: { type: 'string', example: 'STK-1712345678' },
            created_at: { type: 'string', format: 'date-time' }
          }
        },
        // NEW: Deposit Request Schema
        DepositRequest: {
          type: 'object',
          required: ['amount', 'method'],
          properties: {
            amount: { type: 'number', example: 5000 },
            method: { type: 'string', enum: ['Cash', 'Paystack', 'Transfer'] },
            reference: { type: 'string', description: 'Optional custom reference' }
          }
        }
      },
    },
  },
  apis: ['./routes/*.js'], 
};

// 2. Initialize Swagger Spec SECOND
const swaggerSpec = swaggerJsdoc(swaggerOptions);

// ... other imports
app.use('/api/owner', ownerRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/test', testRoutes);
app.use('/api/customer', customerRoutes);

// Swagger UI Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root Redirect to Documentation
app.get('/', (req, res) => {
  res.redirect('/api-docs');
});

// Server Initialization
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Docs available at: http://localhost:${PORT}/api-docs`); 
});
