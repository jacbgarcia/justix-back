
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

class AuthService {
    constructor(db) {
        this.db = db;
    }

    generateTokens(user) {
        const accessToken = jwt.sign(
            { 
                id: user.id_usuario,
                role: user.role,
                nome: user.nome 
            },
            process.env.JWT_ACCESS_SECRET,
            { expiresIn: '1h' }
        );

        const refreshToken = jwt.sign(
            { id: user.id_usuario },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '7d' }
        );

        return { accessToken, refreshToken };
    }


    async saveToken(userId, token, tipo, userAgent) {
        const expiracao = tipo === 'access' ? 
            new Date(Date.now() + 60 * 60 * 1000) : 
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); 

        const query = `
            INSERT INTO user_tokens 
            (id_usuario, token, tipo, data_expiracao, user_agent) 
            VALUES (?, ?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            this.db.query(query, [userId, token, tipo, expiracao, userAgent], 
                (err, result) => {
                    if (err) reject(err);
                    else resolve(result);
                }
            );
        });
    }

   
    async verifyTokenValidity(token) {
        const query = `
            SELECT * FROM user_tokens 
            WHERE token = ? 
            AND is_revoked = FALSE 
            AND data_expiracao > NOW()
        `;

        return new Promise((resolve, reject) => {
            this.db.query(query, [token], (err, result) => {
                if (err) reject(err);
                else resolve(result.length > 0);
            });
        });
    }

    
    async revokeToken(token) {
        const query = `
            UPDATE user_tokens 
            SET is_revoked = TRUE 
            WHERE token = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.query(query, [token], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }

   
    async revokeAllUserTokens(userId) {
        const query = `
            UPDATE user_tokens 
            SET is_revoked = TRUE 
            WHERE id_usuario = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.query(query, [userId], (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        });
    }
}
module.exports = { AuthService };