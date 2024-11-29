const express = require('express');
const cors = require('cors');
const mysql = require('mysql2');
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');
const solc = require('solc');
const axios = require('axios');
const NodeCache = require('node-cache');

const authMiddleware = require('./src/middleware/authMiddleware');
const userRoutes = require('./src/routes/userRoutes');
const userInfoRoutes = require('./src/routes/userInfoRoutes');
const agentRoutes = require('./src/routes/agentRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const ipfsRoutes = require('./src/routes/ipfsRoutes');
const teamRoutes = require('./src/routes/teamRoutes');
const creditRoutes = require('./src/routes/creditRoutes');

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

app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'src/public/generated', filename);
  res.download(filePath, filename, (err) => {
    if (err) {
      res.status(404).send('File not found');
    }
  });
});

const contractCache = new NodeCache({ stdTTL: 3600 });

// 同步获取远程合约内容
function getRemoteContractSync(url) {
  try {
    return require('sync-request')('GET', url).getBody('utf8');
  } catch (error) {
    console.error('Error fetching remote contract:', error);
    return null;
  }
}

app.post('/api/compile', (req, res) => {
  const { source } = req.body;
  
  try {
    // 准备 import callback
    const findImports = (path) => {
      console.log('Resolving import:', path);

      // 处理 OpenZeppelin 导入
      if (path.startsWith('@openzeppelin/')) {
        // 修正：使用正确的 GitHub 路径
        const githubPath = path.replace(
          '@openzeppelin/contracts/',
          'https://raw.githubusercontent.com/OpenZeppelin/openzeppelin-contracts/v4.9.3/contracts/'
        );
        
        console.log('Fetching from:', githubPath);
        
        // 从缓存获取
        let contents = contractCache.get(path);
        
        if (!contents) {
          // 同步获取远程内容
          contents = getRemoteContractSync(githubPath);
          if (contents) {
            contractCache.set(path, contents);
          } else {
            console.error('Failed to fetch contract from:', githubPath);
            return { error: `Contract not found at ${githubPath}` };
          }
        }
        
        return { contents };
      }

      return { error: 'Contract not found' };
    };

    // 准备编译器输入
    const input = {
      language: 'Solidity',
      sources: {
        'contract.sol': {
          content: source
        }
      },
      settings: {
        outputSelection: {
          '*': {
            '*': ['*']
          }
        },
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    };

    console.log('Compiling with source:', source);

    // 编译合约
    const output = JSON.parse(
      solc.compile(JSON.stringify(input), { import: findImports })
    );

    // 处理编译错误和警告
    if (output.errors) {
      const errors = output.errors.filter(error => error.severity === 'error');
      const warnings = output.errors.filter(error => error.severity === 'warning');

      console.log('Compilation errors:', errors);
      console.log('Compilation warnings:', warnings);

      if (errors.length > 0) {
        return res.status(400).json({
          success: false,
          errors: errors.map(e => e.formattedMessage),
          warnings: warnings.map(w => w.formattedMessage)
        });
      }
    }

    // 获取编译结果
    if (!output.contracts || !output.contracts['contract.sol']) {
      throw new Error('Compilation produced no contracts');
    }

    const contractName = Object.keys(output.contracts['contract.sol'])[0];
    const contract = output.contracts['contract.sol'][contractName];

    res.json({
      success: true,
      contractName,
      abi: contract.abi,
      bytecode: contract.evm.bytecode.object,
      warnings: output.errors ? output.errors
        .filter(e => e.severity === 'warning')
        .map(w => w.formattedMessage) : []
    });

  } catch (error) {
    console.error('Compilation error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Compilation failed', 
      details: error.message,
      stack: error.stack
    });
  }
});

app.post('/api/ipfs/upload', async (req, res) => {
  const ipfsService = require('./src/services/ipfsService');

  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: 'No content provided' });
    }

    // 上传到 IPFS
    const ipfsHash = await ipfsService.addToIPFS(content);
    
    res.json({ 
      success: true,
      ipfsHash 
    });
  } catch (error) {
    console.error('Error uploading to IPFS:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to upload to IPFS',
      details: error.message 
    });
  }

});

const cleanupGeneratedFiles = async () => {
  const directory = path.join(__dirname, 'src/public/generated');
  try {
    const files = await fs.readdir(directory);
    for (const file of files) {
      await fs.unlink(path.join(directory, file));
    }
    console.log('Generated files cleanup completed');
  } catch (error) {
    console.error('Error during generated files cleanup:', error);
  }
};

// 每两天的凌晨 3:00 执行清理任务
cron.schedule('0 3 */2 * *', () => {
  console.log('Starting scheduled cleanup of generated files');
  cleanupGeneratedFiles();
});

cleanupGeneratedFiles();

cron.schedule('0 0 * * *', async () => {
  console.log('Running daily credit check...');
  try {
    const CreditService = require('./src/services/creditService');
    await CreditService.runDailyUpdate();
  } catch (error) {
    console.error('Error in daily credit update:', error);
  }
});

cron.schedule('0 1 * * 1', async () => {
  console.log('Starting weekly credit reset...');
  try {
    const CreditService = require('./src/services/creditService');
    await CreditService.weeklyReset();
  } catch (error) {
      console.error('Error in weekly credit reset:', error);
  }
}, {
  scheduled: true,
  timezone: "UTC" // 使用UTC时间确保全球统一
});


// Routes
app.use('/api/users', userRoutes);
app.use('/api/usersInfo', authMiddleware, userInfoRoutes);
app.use('/api/agents', authMiddleware, agentRoutes);
app.use('/api/chat', authMiddleware, chatRoutes);
app.use('/api/ipfs', authMiddleware, ipfsRoutes);
app.use('/api/teams', authMiddleware, teamRoutes);
app.use('/api/credits', authMiddleware, creditRoutes); 

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
