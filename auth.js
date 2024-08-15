const jwt = require('jsonwebtoken');
const web3 = require('../config/blockchain');

exports.verifyToken = (req, res, next) => {
  const token = req.headers['x-access-token'];
  if (!token) {
    return res.status(403).json({ message: "No token provided!" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized!" });
    }
    req.userId = decoded.id;
    next();
  });
};

exports.verifySignature = (req, res, next) => {
  const { address, signature } = req.body;
  const message = "Login to MultiAgent Platform";
  try {
    const recoveredAddress = web3.eth.accounts.recover(message, signature);
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ message: "Invalid signature!" });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: "Error verifying signature" });
  }
};

exports.authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader) {
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) {
        return res.sendStatus(403);
      }

      req.user = user;
      next();
    });
  } else {
    res.sendStatus(401);
  }
};
