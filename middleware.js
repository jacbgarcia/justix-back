const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
  
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Token não fornecido'
      });
    }
  
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(403).json({
        status: 'error',
        message: 'Token inválido ou expirado'
      });
    }
  };

  const checkRole = (roles) => {
    return (req, res, next) => {
      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          status: 'error',
          message: 'Acesso não autorizado'
        });
      }
      next();
    };
  };

  module.exports = {verifyToken, checkRole};