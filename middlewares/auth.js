
const authMiddleware = (authService) => async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Token não fornecido' });
        }

        
        const isValid = await authService.verifyTokenValidity(token);
        if (!isValid) {
            return res.status(401).json({ error: 'Token inválido ou expirado' });
        }

   
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        req.user = decoded;
        
        next();
    } catch (error) {
        console.error('Erro na autenticação:', error);
        res.status(401).json({ error: 'Token inválido' });
    }
};