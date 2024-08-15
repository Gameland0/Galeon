const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const userRoutes = require('./routes/userRoutes');
const agentRoutes = require('./routes/agentRoutes');
const trainingRoutes = require('./routes/trainingRoutes');
const knowledgeBaseRoutes = require('./routes/knowledgeBaseRoutes');
const dialogueRoutes = require('./routes/dialogueRoutes');
const marketRoutes = require('./routes/marketRoutes');
const walletRoutes = require('./routes/walletRoutes');
const contractRoutes = require('./routes/contractRoutes');
const marketplaceRoutes = require('./routes/marketplaceRoutes');
const chatRoutes = require('./routes/chatRoutes');



const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(apiLimiter);

app.use(session({
    secret: 'your_session_secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});
  
  
  

app.use('/api/users', userRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/knowledge', knowledgeBaseRoutes);
app.use('/api/dialogue', dialogueRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/chat', chatRoutes);



app.use(errorHandler);

module.exports = app;
