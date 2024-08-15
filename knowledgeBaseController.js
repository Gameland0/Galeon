const db = require('../config/database');
const ipfs = require('../config/ipfs');

exports.addKnowledge = async (req, res) => {
  const { agentId, knowledge } = req.body;

  try {
    // 将知识内容添加到IPFS
    const result = await ipfs.add(JSON.stringify(knowledge));
    const ipfsHash = result.path;

    // 将IPFS哈希存储到数据库
    const query = 'INSERT INTO knowledge_base (agent_id, ipfs_hash) VALUES (?, ?)';
    db.query(query, [agentId, ipfsHash], (error, results) => {
      if (error) {
        console.error('Error adding knowledge to database:', error);
        return res.status(500).json({ error: 'Could not add knowledge' });
      }
      res.status(201).json({ 
        message: 'Knowledge added successfully', 
        id: results.insertId, 
        ipfsHash 
      });
    });
  } catch (error) {
    console.error('Error adding knowledge to IPFS:', error);
    res.status(500).json({ error: 'Could not add knowledge to IPFS' });
  }
};

exports.getKnowledge = (req, res) => {
  const { agentId } = req.params;

  const query = 'SELECT * FROM knowledge_base WHERE agent_id = ?';
  db.query(query, [agentId], async (error, results) => {
    if (error) {
      console.error('Error fetching knowledge from database:', error);
      return res.status(500).json({ error: 'Could not fetch knowledge' });
    }

    try {
      // 获取每个知识条目的内容
      const knowledgeWithContent = await Promise.all(results.map(async (item) => {
        const content = await ipfs.cat(item.ipfs_hash);
        return {
          ...item,
          content: JSON.parse(content.toString())
        };
      }));

      res.json(knowledgeWithContent);
    } catch (ipfsError) {
      console.error('Error fetching knowledge content from IPFS:', ipfsError);
      res.status(500).json({ error: 'Could not fetch knowledge content from IPFS' });
    }
  });
};

exports.deleteKnowledge = (req, res) => {
  const { id } = req.params;

  const query = 'DELETE FROM knowledge_base WHERE id = ?';
  db.query(query, [id], (error, results) => {
    if (error) {
      console.error('Error deleting knowledge from database:', error);
      return res.status(500).json({ error: 'Could not delete knowledge' });
    }
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Knowledge not found' });
    }
    res.json({ message: 'Knowledge deleted successfully' });
  });
};

exports.updateKnowledge = async (req, res) => {
  const { id } = req.params;
  const { knowledge } = req.body;

  try {
    // 更新IPFS中的知识内容
    const result = await ipfs.add(JSON.stringify(knowledge));
    const newIpfsHash = result.path;

    // 更新数据库中的IPFS哈希
    const query = 'UPDATE knowledge_base SET ipfs_hash = ? WHERE id = ?';
    db.query(query, [newIpfsHash, id], (error, results) => {
      if (error) {
        console.error('Error updating knowledge in database:', error);
        return res.status(500).json({ error: 'Could not update knowledge' });
      }
      if (results.affectedRows === 0) {
        return res.status(404).json({ error: 'Knowledge not found' });
      }
      res.json({ message: 'Knowledge updated successfully', ipfsHash: newIpfsHash });
    });
  } catch (error) {
    console.error('Error updating knowledge in IPFS:', error);
    res.status(500).json({ error: 'Could not update knowledge in IPFS' });
  }
};