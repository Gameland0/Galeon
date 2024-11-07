// const authMiddleware = (req, res, next) => {
//     // 此处暂时不进行token验证
//     // 如果将来需要验证，可以在这里添加验证逻辑
  
//     // 为了演示目的，我们可以添加一个模拟的用户ID
//     // 在实际应用中，这个ID应该从验证的token中获取
//     req.userId = 'mock-user-id';
  
//     // 继续处理请求
//     next();
//   };
  
//   module.exports = authMiddleware;
const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  // 从请求头中获取 token
  const token = req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return res.status(401).json({ error: 'No token provided, authorization denied' });
  }

  try {
    // 验证 token
    // console.log('token:',token);
    // console.log('JWT_SECRET:',process.env.JWT_SECRET);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 将解码后的用户信息添加到请求对象中
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

module.exports = authMiddleware;
