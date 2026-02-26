const mysql = require('mysql2');
require('dotenv').config(); // Ensure variables are loaded

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT , // Add this line!
  waitForConnections: true,
  connectionLimit: 10,
  ssl: {
    rejectUnauthorized: false 
  },
  connectTimeout: 20000 // Added to prevent early timeouts
});


module.exports = pool.promise();

