const crypto = require('crypto');
const jwt = require('jsonwebtoken');

class SecurityService {
  generateToken(userId) {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '24h' });
  }

  verifyToken(token) {
    return jwt.verify(token, process.env.JWT_SECRET);
  }

  hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
  }
}

module.exports = new SecurityService();
