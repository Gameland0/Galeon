const db = require('../config/database');

exports.getMarketplaceAgents = (req, res) => {
  db.query('SELECT * FROM agents', (error, results) => {
    if (error) {
      console.error('Error fetching marketplace agents:', error);
      return res.status(500).json({ message: 'Error fetching marketplace agents', error: error.message });
    }
    res.json(results);
  });
};


