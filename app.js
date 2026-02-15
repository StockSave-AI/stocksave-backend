require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

app.use(cors()); 


app.use(express.json());

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'My API', version: '1.0.0' },
    servers: [{ url: `http://localhost:${process.env.PORT || 3000}` }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
      }
    }
  },
  apis: ['./routes/*.js'], // This looks inside your routes folder for documentation
});




const authRoutes = require('./routes/authRoutes');

const testRoutes = require('./routes/testRoute');
const savingsRoutes = require('./routes/savingRoute');
const inventoryRoutes = require('./routes/inventory');
const payoutRoutes = require('./routes/payoutRoute');

// Global Route Mapping
app.use('/api/auth', authRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

//app.use('/api/auth', authRoutes);      // Handles Signup, Login, Forgot Password
//app.use('/api/plans', planRoutes);    // Handles Plan Selection & Updates
//app.use('/api/wallet', walletRoutes); // Handles Savings, Withdraw, & Dashboard Activity
app.use('/api/test', testRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Docs: http://localhost:${PORT}/api-docs`); 
});
