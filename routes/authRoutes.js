const express = require('express');
const router = express.Router();
const { AuthService } = require('../services/authService');
const jwt = require('jsonwebtoken'); // Certifique-se de importar o jwt
const bcrypt = require('bcrypt'); // Certifique-se de importar o bcrypt

module.exports = (db) => {
    const authService = new AuthService(db);

    // Login
    router.post('/login', async (req, res) => {
        try {
            const { email, senha } = req.body;
            const userAgent = req.headers['user-agent'];

            // Buscar usuário
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
                
                // Verificar senha
                const isMatch = await bcrypt.compare(senha, usuario.senha);
                if (!isMatch) {
                    return res.status(400).json({ error: 'Senha incorreta' });
                }

                // Gerar tokens
                const { accessToken, refreshToken } = authService.generateTokens(usuario);

                // Salvar tokens no banco
                await authService.saveToken(usuario.id_usuario, accessToken, 'access', userAgent);
                await authService.saveToken(usuario.id_usuario, refreshToken, 'refresh', userAgent);

                // Enviar resposta
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

    // Refresh Token
    router.post('/refresh-token', async (req, res) => {
        try {
            const { refreshToken } = req.body;
            const userAgent = req.headers['user-agent'];

            // Verificar se refresh token é válido no banco
            const isValid = await authService.verifyTokenValidity(refreshToken);
            if (!isValid) {
                return res.status(401).json({ error: 'Refresh token inválido' });
            }

            // Decodificar refresh token
            const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

            // Buscar usuário
            const sql = 'SELECT * FROM usuarios WHERE id_usuario = ?';
            
            db.query(sql, [decoded.id], async (err, result) => {
                if (err || result.length === 0) {
                    return res.status(401).json({ error: 'Usuário não encontrado' });
                }

                const usuario = result[0];

                // Gerar novo access token
                const { accessToken: newAccessToken } = authService.generateTokens(usuario);

                // Salvar novo token
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

    // Logout
    router.post('/logout', async (req, res) => {
        try {
            const { refreshToken } = req.body;
            
            // Revogar refresh token
            await authService.revokeToken(refreshToken);
            
            res.json({ message: 'Logout realizado com sucesso' });
        } catch (error) {
            console.error('Erro no logout:', error);
            res.status(500).json({ error: 'Erro ao fazer logout' });
        }
    });

    return router;
};
