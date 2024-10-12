const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
require('dotenv').config();

const authMiddleware = require('./src/middleware/authMiddleware');
const userRoutes = require('./src/routes/userRoutes');
const agentRoutes = require('./src/routes/agentRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const ipfsRoutes = require('./src/routes/ipfsRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const AIService = require('./src/services/aiService');

const app = express();

var corsOptions = {
  origin: ["http://localhost:3000","https://ai.gameland.network"]
};

app.use(cors(corsOptions));
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

db.connect((err) => {
  if (err) {
    console.error('Error connecting to the database:', err);
    return;
  }
  console.log('Connected to the database');
});

// Routes
app.use('/api/users', userRoutes);
app.use('/api/agents', authMiddleware, agentRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/ipfs', authMiddleware, ipfsRoutes);
app.use('/api/teams', authMiddleware, teamRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
