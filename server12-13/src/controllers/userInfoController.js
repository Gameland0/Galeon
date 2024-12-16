const DatabaseService = require('../services/databaseService');

exports.getUserInfo = async (req, res) => {
  // const { address } = req.params;
  const info = await DatabaseService.query('SELECT * FROM user_info WHERE userid = ?', [req.userId]);
  res.status(200).json(info);
};

exports.updataTeammax = async (req, res) => {
  const info = await DatabaseService.query(
    'UPDATE user_info SET teammax = teammax + 1 WHERE userid = ?',
    [req.userId]
  );
  res.status(200).json(info);
};