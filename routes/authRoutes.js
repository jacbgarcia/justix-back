const express = require('express');
const router = express.Router();
const { AuthService } = require('../services/authService');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt'); 

module.exports = (db) => {
    const authService = new AuthService(db);

   
    router.post('/login', async (req, res) => {
        try {
            const { email, senha } = req.body;
            const userAgent = req.headers['user-agent'];

            const sql = 'SELECT * FROM usuarios WHERE email = ?';
            
            db.query(sql, [email], async (err, result) => {
                if (err) {
                    console.error('Erro na consulta:', err);
                    return res.status(500).json({ error: 'Erro no servidor' });
                }
                
                if (result.length === 0) {
                    return res.status(400).json({ error: 'Usuário não encontrado' });
                }

                const usuario = result[0];
                
         
                const isMatch = await bcrypt.compare(senha, usuario.senha);
                if (!isMatch) {
                    return res.status(400).json({ error: 'Senha incorreta' });
                }

            
                const { accessToken, refreshToken } = authService.generateTokens(usuario);

              
                await authService.saveToken(usuario.id_usuario, accessToken, 'access', userAgent);
                await authService.saveToken(usuario.id_usuario, refreshToken, 'refresh', userAgent);

              
                res.json({
                    message: 'Login realizado com sucesso',
                    accessToken,
                    refreshToken,
                    user: {
                        id: usuario.id_usuario,
                        nome: usuario.nome,
                        role: usuario.role
                    }
                });
            });
        } catch (error) {
            console.error('Erro no login:', error);
            res.status(500).json({ error: 'Erro interno do servidor' });
        }
    });

  
    router.post('/refresh-token', async (req, res) => {
        try {
            const { refreshToken } = req.body;
            const userAgent = req.headers['user-agent'];

  
            const isValid = await authService.verifyTokenValidity(refreshToken);
            if (!isValid) {
                return res.status(401).json({ error: 'Refresh token inválido' });
            }

       
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        
            const sql = 'SELECT * FROM usuarios WHERE id_usuario = ?';
            
            db.query(sql, [decoded.id], async (err, result) => {
                if (err || result.length === 0) {
                    return res.status(401).json({ error: 'Usuário não encontrado' });
                }

                const usuario = result[0];


                const { accessToken: newAccessToken } = authService.generateTokens(usuario);

         
                await authService.saveToken(usuario.id_usuario, newAccessToken, 'access', userAgent);

                res.json({
                    accessToken: newAccessToken
                });
            });
        } catch (error) {
            console.error('Erro no refresh token:', error);
            res.status(401).json({ error: 'Erro ao renovar token' });
        }
    });

 
    router.post('/logout', async (req, res) => {
        try {
            const { refreshToken } = req.body;
            
           
            await authService.revokeToken(refreshToken);
            
            res.json({ message: 'Logout realizado com sucesso' });
        } catch (error) {
            console.error('Erro no logout:', error);
            res.status(500).json({ error: 'Erro ao fazer logout' });
        }
    });

    return router;
};
