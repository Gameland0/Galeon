const db = require('../config/database');

const User = {
  async create(address, chainId) {
    const [result] = await db.query(
      'INSERT INTO users (address, chain_id) VALUES (?, ?)',
      [address, chainId]
    );
    return { id: result.insertId, address, chainId };
  },

  async findByAddress(address) {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE address = ?',
      [address]
    );
    return rows[0];
  },

  async updateChainId(id, chainId) {
    await db.query(
      'UPDATE users SET chain_id = ? WHERE id = ?',
      [chainId, id]
    );
  },

  async findById(id) {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE id = ?',
      [id]
    );
    return rows[0];
  }
};

module.exports = User;
