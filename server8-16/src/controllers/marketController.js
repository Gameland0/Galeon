const db = require('../config/database');

exports.listAgent = (req, res) => {
  const { agentId, price } = req.body;
  
  db.query('INSERT INTO market_listings (agent_id, price) VALUES (?, ?)', 
    [agentId, price], 
    (error, result) => {
      if (error) {
        return res.status(500).json({ error: 'Could not list agent' });
      }
      res.json({ message: 'Agent listed', listingId: result.insertId });
    }
  );
};

exports.getListings = (req, res) => {
  db.query('SELECT * FROM market_listings WHERE sold = 0', (error, results) => {
    if (error) {
      return res.status(500).json({ error: 'Could not fetch listings' });
    }
    res.json(results);
  });
};
