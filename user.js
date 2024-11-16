const express = require('express');
const router = express.Router();
 // Configuração para o banco de dados

// Rota para obter dados de um usuário específico pelo id
router.get('/usuarios/:id', async (req, res) => {
    const id = req.params.id;
    
    try {
        const [rows] = await db.query('SELECT * FROM usuarios WHERE id_usuario = ?', [id]);
        
        if (rows.length > 0) {
            res.json(rows[0]); // Retorna o primeiro registro encontrado
        } else {
            res.status(404).json({ message: 'Usuário não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao buscar usuário:', error);
        res.status(500).json({ message: 'Erro no servidor' });
    }
});

module.exports = userid;