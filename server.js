const mysql = require('mysql2');
require ('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT;



const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const JWT_SECRET = 'root';




// Configuração do pool de conexões
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  port: process.env.DB_PORT,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10, // Limite máximo de conexões no pool
  queueLimit: 0 // Sem limite na fila de espera
});


// Configuração do Multer para upload de imagens
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.originalUrl.split('/')[1]; // Pega 'foruns', 'tribunais', etc.
    const uploadPath = path.join(__dirname, 'uploads', type);

    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb('Erro: Arquivo deve ser uma imagem (jpeg, jpg, png, gif)!');
    }
  }
});

// Função auxiliar para deletar arquivo de imagem
const deleteImage = (imagePath) => {
  if (!imagePath) return;

  const fullPath = path.join(__dirname, imagePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

// Rota para upload de imagens genéricas
app.post('/upload/:type', upload.single('image'), (req, res) => {
  if (req.file) {
    res.send({ message: 'Arquivo enviado com sucesso!', file: req.file });
  } else {
    res.status(400).send({ message: 'Erro ao enviar o arquivo.' });
  }
});

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ROTAS PARA FÓRUNS
app.get('/foruns', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM foruns');
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao buscar fóruns' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/foruns', upload.single('imagem'), async (req, res) => {
  const { nome, cidade, estado, endereco, cep, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/foruns/${req.file.filename}` : null;

  if (!nome || !cidade || !estado || !cep || !avaliacao_media) {
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query(
      'INSERT INTO foruns (nome, cidade, estado, endereco, cep, avaliacao_media, imagem) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [nome, cidade, estado, endereco, cep, avaliacao_media, imagem]
    );
    res.send({ ...result, imagem });
  } catch (err) {
    console.error('Erro ao inserir fórum:', err);
    res.status(500).send({ error: 'Erro ao inserir fórum' });
  } finally {
    if (connection) connection.release();
  }
});

app.put('/foruns/:id', upload.single('imagem'), async (req, res) => {
  const id = req.params.id;
  const { nome, cidade, estado, endereco, cep, avaliacao_media } = req.body;

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM foruns WHERE id_forum = ?', [id]);

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/foruns/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE foruns
      SET nome = ?, cidade = ?, estado = ?, endereco = ?, 
          cep = ?, avaliacao_media = ?, imagem = ?
      WHERE id_forum = ?
    `;

    await connection.query(
      sql, 
      [nome, cidade, estado, endereco, cep, avaliacao_media, novaImagem, id]
    );

    if (req.file && antigaImagem) {
      deleteImage(antigaImagem);
    }

    res.send({ message: 'Fórum atualizado com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar fórum:', err);
    res.status(500).send({ error: 'Erro ao atualizar fórum' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/foruns/:id', async (req, res) => {
  const id = req.params.id;

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM foruns WHERE id_forum = ?', [id]);

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    await connection.query('DELETE FROM av_foruns WHERE id_forum = ?', [id]);

    // Deletar o fórum
    await connection.query('DELETE FROM foruns WHERE id_forum = ?', [id]);

    // Se existir uma imagem, deletá-la
    if (imagem) {
      deleteImage(imagem);
    }

    res.send({ message: 'Fórum, suas avaliações e imagem deletados com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar fórum:', err);
    res.status(500).send({ error: 'Erro ao deletar fórum' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/foruns/:id', async (req, res) => {
  const id = req.params.id;

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM foruns WHERE id_forum = ?', [id]);

    if (result.length === 0) {
      return res.status(404).send({ error: 'Fórum não encontrado' });
    }

    res.send(result[0]);
  } catch (err) {
    console.error('Erro ao buscar fórum:', err);
    res.status(500).send({ error: 'Erro ao buscar fórum' });
  } finally {
    if (connection) connection.release();
  }
});

// ROTAS PARA TRIBUNAIS
app.get('/tribunais', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM tribunais');
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar tribunais:', err);
    res.status(500).send({ error: 'Erro ao buscar tribunais' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/tokens', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM user_tokens');
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar tokens:', err);
    res.status(500).send({ error: 'Erro ao buscar tokens' });
  } finally {
    if (connection) connection.release();
  }
});


app.get('/tribunais/:id', async (req, res) => {
  const id = req.params.id;
  let connection;

  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM tribunais WHERE id_tribunal = ?', [id]);

    if (result.length === 0) {
      return res.status(404).send({ error: 'Tribunal não encontrado' });
    }

    res.send(result[0]);
  } catch (err) {
    console.error('Erro ao buscar tribunal:', err);
    res.status(500).send({ error: 'Erro ao buscar tribunal' });
  } finally {
    if (connection) connection.release();
  }
});




app.post('/tribunais', upload.single('imagem'), async (req, res) => {
  const { nome, cidade, estado, endereco, cep, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/tribunais/${req.file.filename}` : null;

  if (!nome || !cidade || !estado || !cep || !avaliacao_media) {
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    const sql = 'INSERT INTO tribunais (nome, cidade, estado, endereco, cep, avaliacao_media, imagem) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const [result] = await connection.query(sql, [nome, cidade, estado, endereco, cep, avaliacao_media, imagem]);

    res.send({ ...result, imagem });
  } catch (err) {
    console.error('Erro ao inserir tribunal:', err);
    res.status(500).send({ error: 'Erro ao inserir tribunal' });
  } finally {
    if (connection) connection.release();
  }
});


app.put('/tribunais/:id', upload.single('imagem'), async (req, res) => {
  const id = req.params.id;
  const { nome, cidade, estado, endereco, cep, avaliacao_media } = req.body;

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM tribunais WHERE id_tribunal = ?', [id]);

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/tribunais/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE tribunais 
      SET nome = ?, cidade = ?, estado = ?, endereco = ?, 
          cep = ?, avaliacao_media = ?, imagem = ?
      WHERE id_tribunal = ?
    `;
    await connection.query(sql, [nome, cidade, estado, endereco, cep, avaliacao_media, novaImagem, id]);

    if (req.file && antigaImagem) {
      deleteImage(antigaImagem);
    }

    res.send({ message: 'Tribunal atualizado com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar tribunal:', err);
    res.status(500).send({ error: 'Erro ao atualizar tribunal' });
  } finally {
    if (connection) connection.release();
  }
});


app.delete('/tribunais/:id', async (req, res) => {
  const id = req.params.id;
  let connection;

  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM tribunais WHERE id_tribunal = ?', [id]);

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    await connection.query('DELETE FROM av_tribunais WHERE id_tribunal = ?', [id]);

    // Deletar o tribunal
    await connection.query('DELETE FROM tribunais WHERE id_tribunal = ?', [id]);

    // Se existir uma imagem, deletá-la
    if (imagem) {
      deleteImage(imagem);
    }

    res.send({ message: 'Tribunal, suas avaliações e imagem deletados com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar tribunal:', err);
    res.status(500).send({ error: 'Erro ao deletar tribunal' });
  } finally {
    if (connection) connection.release();
  }
});


// ROTAS PARA JUIZ
app.get('/juiz', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM juiz');
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar juízes:', err);
    res.status(500).send({ error: 'Erro ao buscar juízes' });
  } finally {
    if (connection) connection.release();
  }
});


app.get('/juiz/:id', async (req, res) => {
  const id = req.params.id;
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM juiz WHERE id_juiz = ?', [id]);

    if (result.length === 0) {
      return res.status(404).send({ error: 'Juiz não encontrado' });
    }
    
    res.send(result[0]);
  } catch (err) {
    console.error('Erro ao buscar juiz:', err);
    res.status(500).send({ error: 'Erro ao buscar juiz' });
  } finally {
    if (connection) connection.release();
  }
});


app.post('/juiz', upload.single('imagem'), async (req, res) => {
  const { nome, tempo_servico, casos_julgados, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/juiz/${req.file.filename}` : null;

  if (!nome || !tempo_servico || !casos_julgados || !avaliacao_media) {
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    const sql = 'INSERT INTO juiz (nome, tempo_servico, casos_julgados, avaliacao_media, imagem) VALUES (?, ?, ?, ?, ?)';
    const [result] = await connection.query(sql, [nome, tempo_servico, casos_julgados, avaliacao_media, imagem]);

    res.send({ ...result, imagem });
  } catch (err) {
    console.error('Erro ao inserir juiz:', err);
    res.status(500).send({ error: 'Erro ao inserir juiz' });
  } finally {
    if (connection) connection.release();
  }
});

app.put('/juiz/:id', upload.single('imagem'), async (req, res) => {
  const id = req.params.id;
  const { nome, tempo_servico, casos_julgados, avaliacao_media } = req.body;

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM juiz WHERE id_juiz = ?', [id]);

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/juiz/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE juiz 
      SET nome = ?, tempo_servico = ?, casos_julgados = ?, 
          avaliacao_media = ?, imagem = ?
      WHERE id_juiz = ?
    `;
    await connection.query(sql, [nome, tempo_servico, casos_julgados, avaliacao_media, novaImagem, id]);

    if (req.file && antigaImagem) {
      deleteImage(antigaImagem);
    }

    res.send({ message: 'Juiz atualizado com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar juiz:', err);
    res.status(500).send({ error: 'Erro ao atualizar juiz' });
  } finally {
    if (connection) connection.release();
  }
});


app.delete('/juiz/:id', async (req, res) => {
  const id = req.params.id;
  let connection;

  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM juiz WHERE id_juiz = ?', [id]);

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    await connection.query('DELETE FROM av_juiz WHERE id_juiz = ?', [id]);

    // Deletar o juiz
    await connection.query('DELETE FROM juiz WHERE id_juiz = ?', [id]);

    // Se existir uma imagem, deletá-la
    if (imagem) {
      deleteImage(imagem);
    }

    res.send({ message: 'Juiz, suas avaliações e imagem deletados com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar juiz:', err);
    res.status(500).send({ error: 'Erro ao deletar juiz' });
  } finally {
    if (connection) connection.release();
  }
});


// ROTAS PARA MEDIADOR
app.get('/mediador', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM mediador');
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar mediadores:', err);
    res.status(500).send({ error: 'Erro ao buscar mediadores' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/mediador/:id', async (req, res) => {
  const id = req.params.id;
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM mediador WHERE id_mediador = ?', [id]);

    if (result.length === 0) {
      return res.status(404).send({ error: 'Mediador não encontrado' });
    }
    
    res.send(result[0]);
  } catch (err) {
    console.error('Erro ao buscar mediador:', err);
    res.status(500).send({ error: 'Erro ao buscar mediador' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/mediador', upload.single('imagem'), async (req, res) => {
  const { nome, estado, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/mediador/${req.file.filename}` : null;

  if (!nome || !estado || !avaliacao_media) {
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    const sql = 'INSERT INTO mediador (nome, estado, avaliacao_media, imagem) VALUES (?, ?, ?, ?)';
    const [result] = await connection.query(sql, [nome, estado, avaliacao_media, imagem]);

    res.send({ ...result, imagem });
  } catch (err) {
    console.error('Erro ao inserir mediador:', err);
    res.status(500).send({ error: 'Erro ao inserir mediador' });
  } finally {
    if (connection) connection.release();
  }
});

app.put('/mediador/:id', upload.single('imagem'), async (req, res) => {
  const id = req.params.id;
  const { nome, estado, avaliacao_media } = req.body;
  
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM mediador WHERE id_mediador = ?', [id]);

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/mediador/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE mediador 
      SET nome = ?, estado = ?, avaliacao_media = ?, imagem = ?
      WHERE id_mediador = ?
    `;
    await connection.query(sql, [nome, estado, avaliacao_media, novaImagem, id]);

    if (req.file && antigaImagem) {
      deleteImage(antigaImagem);
    }

    res.send({ message: 'Mediador atualizado com sucesso' });
  } catch (err) {
    console.error('Erro ao atualizar mediador:', err);
    res.status(500).send({ error: 'Erro ao atualizar mediador' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/mediador/:id', async (req, res) => {
  const id = req.params.id;
  let connection;

  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM mediador WHERE id_mediador = ?', [id]);

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    await connection.query('DELETE FROM av_mediador WHERE id_mediador = ?', [id]);

    // Deletar o mediador
    await connection.query('DELETE FROM mediador WHERE id_mediador = ?', [id]);

    // Se existir uma imagem, deletá-la
    if (imagem) {
      deleteImage(imagem);
    }

    res.send({ message: 'Mediador, suas avaliações e imagem deletados com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar mediador:', err);
    res.status(500).send({ error: 'Erro ao deletar mediador' });
  } finally {
    if (connection) connection.release();
  }
});



// GET all advogados
app.get('/advocacia', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM advocacia');
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar advocacia:', err);
    res.status(500).send({ error: 'Erro ao buscar advocacia' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/advocacia/:id', async (req, res) => {
  const id = req.params.id;
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM advocacia WHERE id_advocacia = ?', [id]);

    if (result.length === 0) {
      return res.status(404).send({ error: 'Advocacia não encontrada' });
    }

    res.send(result[0]);
  } catch (err) {
    console.error('Erro ao buscar advocacia:', err);
    res.status(500).send({ error: 'Erro ao buscar advocacia' });
  } finally {
    if (connection) connection.release();
  }
});

app.post('/advocacia', upload.single('imagem'), async (req, res) => {
  const { nome, profissao, experiencia, escritorio, endereco, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/advocacia/${req.file.filename}` : null;

  // Validação condicional com base na profissão
  if (!nome || !profissao) {
    return res.status(400).send({ error: 'Nome e profissão são obrigatórios' });
  }

  // Validação condicional de acordo com a profissão
  if (profissao === 'Advogado' && (!experiencia || !escritorio)) {
    return res.status(400).send({ error: 'Experiência e escritório são obrigatórios para Advogados' });
  }

  if (profissao === 'Escritório' && !endereco) {
    return res.status(400).send({ error: 'Endereço é obrigatório para Escritórios' });
  }

  // Validação da avaliação média
  const avaliacaoNumero = Number(avaliacao_media);
  if (isNaN(avaliacaoNumero) || avaliacaoNumero < 0 || avaliacaoNumero > 10) {
    return res.status(400).send({ error: 'Avaliação média deve ser um número entre 0 e 10' });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    const sql = `
      INSERT INTO advocacia 
      (nome, profissao, experiencia, escritorio, endereco, imagem, avaliacao_media) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const [result] = await connection.query(sql, [
      nome, 
      profissao, 
      experiencia || null, 
      escritorio || null, 
      endereco || null, 
      imagem,
      avaliacaoNumero
    ]);

    res.send({ ...result, imagem, avaliacao_media: avaliacaoNumero });
  } catch (err) {
    console.error('Erro ao inserir advocacia:', err);
    res.status(500).send({ error: 'Erro ao inserir advocacia' });
  } finally {
    if (connection) connection.release();
  }
});

app.put('/advocacia/:id', upload.single('imagem'), async (req, res) => {
  const id = req.params.id;
  const { nome, profissao, experiencia, escritorio, endereco, avaliacao_media } = req.body;

  // Validação da avaliação média
  const avaliacaoNumero = Number(avaliacao_media);
  if (isNaN(avaliacaoNumero) || avaliacaoNumero < 0 || avaliacaoNumero > 10) {
    return res.status(400).send({ error: 'Avaliação média deve ser um número entre 0 e 10' });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM advocacia WHERE id_advocacia = ?', [id]);

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/advocacia/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE advocacia 
      SET nome = ?, 
          profissao = ?, 
          experiencia = ?, 
          escritorio = ?, 
          endereco = ?, 
          imagem = ?,
          avaliacao_media = ?
      WHERE id_advocacia = ?
    `;

    await connection.query(sql, [
      nome, 
      profissao, 
      experiencia || null, 
      escritorio || null, 
      endereco || null, 
      novaImagem,
      avaliacaoNumero,
      id
    ]);

    if (req.file && antigaImagem) {
      deleteImage(antigaImagem);
    }

    res.send({ 
      message: 'Advocacia atualizada com sucesso',
      avaliacao_media: avaliacaoNumero
    });
  } catch (err) {
    console.error('Erro ao atualizar advocacia:', err);
    res.status(500).send({ error: 'Erro ao atualizar advocacia' });
  } finally {
    if (connection) connection.release();
  }
});

app.get('/advocacia/profissao/:profissao', async (req, res) => {
  const profissao = req.params.profissao;
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM advocacia WHERE profissao = ?', [profissao]);
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar por profissão:', err);
    res.status(500).send({ error: 'Erro ao buscar por profissão' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/advocacia/:id', async (req, res) => {
  const id = req.params.id;
  let connection;

  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT imagem FROM advocacia WHERE id_advocacia = ?', [id]);
    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    await connection.query('DELETE FROM av_advocacia WHERE id_advocacia = ?', [id]);

    // Deletar a advocacia
    await connection.query('DELETE FROM advocacia WHERE id_advocacia = ?', [id]);

    // Se existir uma imagem, deletá-la
    if (imagem) {
      deleteImage(imagem);
    }

    res.send({ message: 'Advocacia, suas avaliações e imagem deletados com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar advocacia:', err);
    res.status(500).send({ error: 'Erro ao deletar advocacia' });
  } finally {
    if (connection) connection.release();
  }
});


// Rota GET - Buscar todos os portais
app.get('/portais', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT id_portal, nome, url, imagem, avaliacao_media FROM portal');
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar portais:', err);
    res.status(500).send({ error: 'Erro ao buscar portais', details: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar portal por ID
app.get('/portais/:id', async (req, res) => {
  const id = req.params.id;
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM portal WHERE id_portal = ?', [id]);
    if (result.length === 0) {
      return res.status(404).send({ error: 'Portal não encontrado' });
    }
    res.send(result[0]);
  } catch (err) {
    console.error('Erro ao buscar portal:', err);
    res.status(500).send({ error: 'Erro ao buscar portal' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota POST - Criar portal com validação de URL
app.post('/portais', upload.single('imagem'), async (req, res) => {
  console.log('Dados recebidos:', req.body); // Log para debug

  const { nome, url, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/portais/${req.file.filename}` : null;

  // Validação mais rigorosa dos campos
  if (!nome || !url) {
    if (req.file) {
      deleteImage(`/uploads/portais/${req.file.filename}`);
    }
    return res.status(400).send({ 
      error: 'Nome e URL são obrigatórios',
      receivedData: { nome, url } // Mostra os dados recebidos para debug
    });
  }

  // Validação básica de URL
  try {
    new URL(url);
  } catch (e) {
    if (req.file) {
      deleteImage(`/uploads/portais/${req.file.filename}`);
    }
    return res.status(400).send({ error: 'URL inválida' });
  }

  const sql = 'INSERT INTO portal (nome, url, imagem, avaliacao_media) VALUES (?, ?, ?, ?)';
  const values = [
    nome,
    url,
    imagem,
    avaliacao_media || '2.00'
  ];

  // Log para debug
  console.log('SQL:', sql);
  console.log('Valores:', values);

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query(sql, values);

    // Buscar o registro recém-inserido para confirmar
    const [selectResult] = await connection.query('SELECT * FROM portal WHERE id_portal = ?', [result.insertId]);
    console.log('Portal inserido:', selectResult[0]); // Log para debug
    res.status(201).send(selectResult[0]);
  } catch (err) {
    console.error('Erro ao inserir portal:', err);
    if (req.file) {
      deleteImage(`/uploads/portais/${req.file.filename}`);
    }
    res.status(500).send({ 
      error: 'Erro ao inserir portal', 
      details: err.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// Rota PUT - Atualizar portal com validação de URL
app.put('/portais/:id', upload.single('imagem'), async (req, res) => {
  console.log('Dados de atualização recebidos:', req.body); // Log para debug
  
  const id = req.params.id;
  const { nome, url, avaliacao_media } = req.body;

  // Se uma URL foi fornecida, validá-la
  if (url) {
    try {
      new URL(url);
    } catch (e) {
      if (req.file) {
        deleteImage(`/uploads/portais/${req.file.filename}`);
      }
      return res.status(400).send({ error: 'URL inválida' });
    }
  }
  
  let connection;
  try {
    connection = await db.promise().getConnection();
    
    // Primeiro, verificar se o portal existe
    const [result] = await connection.query('SELECT * FROM portal WHERE id_portal = ?', [id]);
    if (result.length === 0) {
      if (req.file) {
        deleteImage(`/uploads/portais/${req.file.filename}`);
      }
      return res.status(404).send({ error: 'Portal não encontrado' });
    }

    const antigaImagem = result[0].imagem;
    const novaImagem = req.file ? `/uploads/portais/${req.file.filename}` : antigaImagem;

    // Preparar dados para atualização
    const updateData = {
      nome: nome || result[0].nome,
      url: url || result[0].url,
      imagem: novaImagem,
      avaliacao_media: avaliacao_media || result[0].avaliacao_media
    };

    const sql = `
      UPDATE portal 
      SET nome = ?, 
          url = ?, 
          imagem = ?, 
          avaliacao_media = ?
      WHERE id_portal = ?
    `;

    const updateValues = [
      updateData.nome,
      updateData.url,
      updateData.imagem,
      updateData.avaliacao_media,
      id
    ];

    // Log para debug
    console.log('SQL de atualização:', sql);
    console.log('Valores de atualização:', updateValues);

    const [updateResult] = await connection.query(sql, updateValues);

    if (updateResult.affectedRows === 0) {
      if (req.file) {
        deleteImage(`/uploads/portais/${req.file.filename}`);
      }
      return res.status(404).send({ error: 'Nenhum registro foi atualizado' });
    }

    // Se há uma nova imagem e existia uma antiga, deletar a antiga
    if (req.file && antigaImagem) {
      deleteImage(antigaImagem);
    }

    // Buscar o registro atualizado para confirmar
    const [finalResult] = await connection.query('SELECT * FROM portal WHERE id_portal = ?', [id]);
    console.log('Portal atualizado:', finalResult[0]); // Log para debug
    res.send(finalResult[0]);

  } catch (err) {
    console.error('Erro ao atualizar portal:', err);
    if (req.file) {
      deleteImage(`/uploads/portais/${req.file.filename}`);
    }
    res.status(500).send({ 
      error: 'Erro ao atualizar portal', 
      details: err.message 
    });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar portais com base em um termo de pesquisa
app.get('/portais/search', async (req, res) => {
  const searchTerm = req.query.term;

  // Consulta SQL para filtrar os registros que contenham o termo
  const sql = `
    SELECT id_portal, nome, url, imagem, avaliacao_media
    FROM portal
    WHERE nome LIKE ? OR url LIKE ?
  `;

  const values = [`%${searchTerm}%`, `%${searchTerm}%`];

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query(sql, values);
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar portais:', err);
    res.status(500).send({ error: 'Erro ao buscar portais' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar portal
app.delete('/portais/:id', async (req, res) => {
  const id = req.params.id;

  let connection;
  try {
    connection = await db.promise().getConnection();

    // Primeiro, buscar a imagem do portal
    const [result] = await connection.query('SELECT imagem FROM portal WHERE id_portal = ?', [id]);
    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    await connection.query('DELETE FROM av_portal WHERE id_portal = ?', [id]);

    // Deletar o portal
    await connection.query('DELETE FROM portal WHERE id_portal = ?', [id]);

    // Se existir uma imagem, deletá-la
    if (imagem) {
      deleteImage(imagem);
    }

    res.send({ message: 'Portal, suas avaliações e imagem deletados com sucesso' });
  } catch (err) {
    console.error('Erro ao deletar portal:', err);
    res.status(500).send({ error: 'Erro ao deletar portal' });
  } finally {
    if (connection) connection.release();
  }
});





//usuarios


// Rota GET - Buscar todos os usuários
app.get('/usuarios', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM usuarios');
    res.send(result);
  } catch (err) {
    console.error('Erro ao buscar usuários:', err);
    res.status(500).send({ error: 'Erro ao buscar usuários' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota POST - Cadastro de usuário
app.post('/usuarios', async (req, res) => {
  console.log('Recebendo requisição de cadastro:', req.body); // Log dos dados recebidos

  const { cpf, nome, email, senha, telefone } = req.body;

  if (!cpf || !nome || !email || !senha) {
    console.log('Campos obrigatórios faltando'); // Log de validação
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();

    // Verificar se o usuário já existe
    const [result] = await connection.query('SELECT * FROM usuarios WHERE cpf = ? OR email = ?', [cpf, email]);
    if (result.length > 0) {
      console.log('Usuário já existe'); // Log de usuário duplicado
      return res.status(400).send({ error: 'Usuário já cadastrado com esse CPF ou email' });
    }

    // Criptografar a senha
    const hashedSenha = await bcrypt.hash(senha, 10);

    // Inserir usuário
    const [insertResult] = await connection.query('INSERT INTO usuarios (cpf, nome, email, senha, telefone) VALUES (?, ?, ?, ?, ?)', [cpf, nome, email, hashedSenha, telefone]);
    console.log('Usuário cadastrado com sucesso'); // Log de sucesso
    res.status(201).send({ message: 'Usuário cadastrado com sucesso' });
  } catch (error) {
    console.error('Erro ao processar cadastro:', error); // Log de erro no cadastro
    res.status(500).send({ error: 'Erro ao cadastrar usuário' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar dados do usuário por ID
app.get('/api/usuario/:id', async (req, res) => {
  const userId = req.params.id;

  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT id_usuario, nome, email, role FROM usuarios WHERE id_usuario = ?', [userId]);

    if (result.length === 0) {
      return res.status(404).send({ error: 'Usuário não encontrado' });
    }

    res.json(result[0]);
  } catch (err) {
    console.error('Erro ao buscar dados do usuário:', err);
    res.status(500).send({ error: 'Erro interno do servidor' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota POST - Login de usuário
app.post('/login', async (req, res) => {
  try {
    const { email, senha } = req.body;

    // Validação básica
    if (!email || !senha) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    let connection;
    try {
      connection = await db.promise().getConnection();
      const [result] = await connection.query('SELECT * FROM usuarios WHERE email = ?', [email]);

      if (result.length === 0) {
        return res.status(400).json({ error: 'Usuário não encontrado' });
      }

      const usuario = result[0];

      try {
        const isMatch = await bcrypt.compare(senha, usuario.senha);

        if (!isMatch) {
          return res.status(400).json({ error: 'Senha incorreta' });
        }

        const token = jwt.sign(
          {
            id: usuario.id_usuario,
            role: usuario.role,
            nome: usuario.nome
          },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
        );

        res.json({
          message: 'Login realizado com sucesso',
          token,
          user: {
            id: usuario.id_usuario,
            nome: usuario.nome,
            role: usuario.role,
            cpf: usuario.cpf,         // Adicionado
            email: usuario.email,      // Adicionado
            telefone: usuario.telefone // Adicionado
          }
        });
      } catch (bcryptError) {
        console.error('Erro ao comparar senhas:', bcryptError);
        return res.status(500).json({ error: 'Erro ao verificar senha' });
      }
    } catch (err) {
      console.error('Erro ao consultar o banco de dados para login:', err);
      return res.status(500).json({ error: 'Erro no servidor' });
    } finally {
      if (connection) connection.release();
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
});


const authenticateToken = (req, res, next) => {
  try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
          return res.status(401).json({ error: 'Token não fornecido' });
      }

      jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
          if (err) {
              return res.status(403).json({ error: 'Token inválido' });
          }
          req.user = user;
          next();
      });
  } catch (error) {
      console.error('Erro na autenticação:', error);
      res.status(500).json({ error: 'Erro na autenticação' });
  }
};

// Exemplo de rota protegida
app.get('/protected', authenticateToken, (req, res) => {
  res.json({ message: 'Rota protegida', user: req.user });
});

// Middleware de autorização por role
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).send({ 
        error: 'Acesso não autorizado'
      });
    }
    next();
  };
};




//av_foruns
// app.post('/av_foruns', async (req, res) => {
//   const { id_usuario, id_forum, numero_protocolo, comentario, avaliacao, horario_chegada, horario_saida } = req.body;

//   if (!avaliacao || avaliacao < 1 || avaliacao > 5) {
//     return res.status(400).json({ error: "Avaliação deve estar entre 1 e 5." });
//   }
//   if (!numero_protocolo || numero_protocolo.length < 5 || numero_protocolo.length > 20) {
//     return res.status(400).json({ error: "Número de protocolo deve ter entre 5 e 20 dígitos." });
//   }

//   try {
//     await db.promise().query(
//       'INSERT INTO av_foruns (id_usuario, id_forum, numero_protocolo, comentario, avaliacao, horario_chegada, horario_saida) VALUES (?, ?, ?, ?, ?, ?, ?)',
//       [id_usuario, id_forum, numero_protocolo, comentario || null, avaliacao, horario_chegada || null, horario_saida || null]
//     );
//     res.status(201).json({ message: 'Comentário e avaliação adicionados com sucesso.' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao adicionar o comentário e a avaliação.' });
//   }
// });

// Rota POST - Adicionar avaliação ao fórum
app.post('/av_foruns', async (req, res) => {
  const { 
    id_usuario, 
    id_forum, 
    numero_protocolo, 
    comentario,
    av_atendimento,
    av_organizacao,
    av_digital,
    av_infraestrutura,
    av_seguranca,
    horario_chegada, 
    horario_saida 
  } = req.body;

  // Validação dos campos de avaliação
  const avaliacoes = [
    av_atendimento, av_organizacao, av_digital,
    av_infraestrutura, av_seguranca
  ];

  if (avaliacoes.some(av => av < 1 || av > 5)) {
    return res.status(400).json({ error: "Todas as avaliações devem estar entre 1 e 5." });
  }

  if (!numero_protocolo || numero_protocolo.length < 5 || numero_protocolo.length > 20) {
    return res.status(400).json({ error: "Número de protocolo deve ter entre 5 e 20 dígitos." });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query(
      `INSERT INTO av_foruns (
        id_usuario, id_forum, numero_protocolo, comentario,
        av_atendimento, av_organizacao, av_digital,
        av_infraestrutura, av_seguranca,
        horario_chegada, horario_saida
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario, id_forum, numero_protocolo, comentario,
        av_atendimento, av_organizacao, av_digital,
        av_infraestrutura, av_seguranca,
        horario_chegada || null, horario_saida || null
      ]
    );
    res.status(201).json({ message: 'Avaliação adicionada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Calcular a média ponderada das avaliações de um fórum
app.get('/foruns_avaliacao/:id_forum', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaForum(?)',
      [req.params.id_forum]
    );
    res.json({ 
      media_ponderada: resultado[0][0]?.media_ponderada || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao calcular a média ponderada de avaliações.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar todas as avaliações
app.get('/av_foruns', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM av_foruns');
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao buscar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de um fórum específico
app.get('/av_foruns/:id_forum', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM av_foruns WHERE id_forum = ?', [req.params.id_forum]);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de um fórum
app.delete('/foruns_avaliacao/:id_forum', async (req, res) => {
  const id_forum = req.params.id_forum;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_foruns WHERE id_forum = ?', [id_forum]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/av_foruns/:id_forum', async (req, res) => {
  const id_forum = req.params.id_forum;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_foruns WHERE id_forum = ?', [id_forum]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de um fórum por usuário
app.get('/foruns_avaliacao_usuario/:id_forum/:id_usuario', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [avaliacoes] = await connection.query(
      `SELECT 
        av_atendimento,
        av_organizacao,
        av_digital,
        av_infraestrutura,
        av_seguranca
      FROM av_foruns
      WHERE id_forum = ? AND id_usuario = ?
      ORDER BY data_criacao DESC`,
      [req.params.id_forum, req.params.id_usuario]
    );

    if (avaliacoes.length === 0) {
      return res.json({
        avaliacoes: null,
        message: "Usuário ainda não avaliou este forum"
      });
    }

    // Calcular a média geral das avaliações do usuário com pesos
    const avaliacoesComMedia = avaliacoes.map(avaliacao => {
      const somaAvaliacoes = (
        avaliacao.av_atendimento * 5 +
        avaliacao.av_organizacao * 4 +
        avaliacao.av_digital * 3 +
        avaliacao.av_infraestrutura * 2 +
        avaliacao.av_seguranca * 1 
      );

      const somaPesos = 5 + 4 + 3 + 2 + 1; // Soma dos pesos
      const media = somaAvaliacoes / somaPesos;

      return {
        ...avaliacao,
        media_ponderada: parseFloat(media.toFixed(2)) // Adiciona a média calculada
      };
    });

    res.json({
      avaliacoes: avaliacoesComMedia,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    if (connection) connection.release();
  }
});









//av_tribunais
// app.post('/av_tribunais', async (req, res) => {
//   const { id_usuario, id_tribunal, numero_protocolo, comentario, avaliacao, horario_chegada, horario_saida } = req.body;

//   if (!avaliacao || avaliacao < 1 || avaliacao > 5) {
//     return res.status(400).json({ error: "Avaliação deve estar entre 1 e 5." });
//   }
//   if (!numero_protocolo || numero_protocolo.length < 5 || numero_protocolo.length > 20) {
//     return res.status(400).json({ error: "Número de protocolo deve ter entre 5 e 20 dígitos." });
//   }

//   try {
//     await db.promise().query(
//       'INSERT INTO av_tribunais (id_usuario, id_tribunal, numero_protocolo, comentario, avaliacao, horario_chegada, horario_saida) VALUES (?, ?, ?, ?, ?, ?, ?)',
//       [id_usuario, id_tribunal, numero_protocolo, comentario || null, avaliacao, horario_chegada || null, horario_saida || null]
//     );
//     res.status(201).json({ message: 'Comentário e avaliação adicionados com sucesso.' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao adicionar o comentário e a avaliação.' });
//   }
// });

// Rota POST - Adicionar avaliação ao tribunal
app.post('/av_tribunais', async (req, res) => {
  const { 
    id_usuario, 
    id_tribunal, 
    numero_protocolo, 
    comentario,
    av_eficiencia,
    av_qualidade,
    av_infraestrutura,
    av_tecnologia,
    av_gestao,
    av_transparencia,
    av_sustentabilidade,
    horario_chegada, 
    horario_saida 
  } = req.body;

  // Validação dos campos de avaliação
  const avaliacoes = [
    av_eficiencia, av_qualidade, av_infraestrutura,
    av_tecnologia, av_gestao, av_transparencia,
    av_sustentabilidade
  ];

  if (avaliacoes.some(av => av < 1 || av > 5)) {
    return res.status(400).json({ error: "Todas as avaliações devem estar entre 1 e 5." });
  }

  if (!numero_protocolo || numero_protocolo.length < 5 || numero_protocolo.length > 20) {
    return res.status(400).json({ error: "Número de protocolo deve ter entre 5 e 20 dígitos." });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query(
      `INSERT INTO av_tribunais (
        id_usuario, id_tribunal, numero_protocolo, comentario,
        av_eficiencia, av_qualidade, av_infraestrutura,
        av_tecnologia, av_gestao, av_transparencia,
        av_sustentabilidade, horario_chegada, horario_saida
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario, id_tribunal, numero_protocolo, comentario,
        av_eficiencia, av_qualidade, av_infraestrutura,
        av_tecnologia, av_gestao, av_transparencia,
        av_sustentabilidade, horario_chegada || null, horario_saida || null
      ]
    );
    res.status(201).json({ message: 'Avaliação adicionada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Calcular a média ponderada das avaliações de um tribunal
app.get('/tribunais_avaliacao/:id_tribunal', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaTribunal(?)',
      [req.params.id_tribunal]
    );
    res.json({ 
      media_ponderada: resultado[0][0]?.media_ponderada || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao calcular a média ponderada de avaliações.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar todas as avaliações
app.get('/av_tribunais', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM av_tribunais');
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao buscar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de um tribunal específico
app.get('/av_tribunais/:id_tribunal', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [resultado] = await connection.query(
      'SELECT * FROM av_tribunais WHERE id_tribunal = ?',
      [req.params.id_tribunal]
    );
    res.json(resultado);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar avaliações.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de um tribunal
app.delete('/tribunais_avaliacao/:id_tribunal', async (req, res) => {
  const id_tribunal = req.params.id_tribunal;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_tribunais WHERE id_tribunal = ?', [id_tribunal]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

app.delete('/av_tribunais/:id_tribunal', async (req, res) => {
  try {
    await db.promise().query(
      'DELETE FROM av_tribunais WHERE id_tribunal = ?',
      [req.params.id_tribunal]
    );
    res.json({ message: 'Avaliações deletadas com sucesso' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao deletar avaliações' });
  }
});

// Rota GET - Buscar avaliações de um tribunal por usuário
app.get('/tribunais_avaliacao_usuario/:id_tribunal/:id_usuario', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    // Buscar todas as avaliações do usuário para o tribunal
    const [avaliacoes] = await connection.query(
      `SELECT 
        av_eficiencia,
        av_qualidade,
        av_infraestrutura,
        av_tecnologia,
        av_gestao,
        av_transparencia,
        av_sustentabilidade
      FROM av_tribunais 
      WHERE id_tribunal = ? AND id_usuario = ?`,
      [req.params.id_tribunal, req.params.id_usuario]
    );

    if (avaliacoes.length === 0) {
      return res.json({
        avaliacoes: null,
        message: "Usuário ainda não avaliou este tribunal"
      });
    }

    // Calcular a média para cada avaliação
    const avaliacoesComMedia = avaliacoes.map(avaliacao => {
      const somaAvaliacoes = (
        avaliacao.av_eficiencia * 5 +
        avaliacao.av_qualidade * 4 +
        avaliacao.av_infraestrutura * 3 +
        avaliacao.av_tecnologia * 3 +
        avaliacao.av_gestao * 2 +
        avaliacao.av_transparencia * 2 +
        avaliacao.av_sustentabilidade * 1
      );

      const somaPesos = 5 + 4 + 3 + 3 + 2 + 2 + 1; // Soma dos pesos
      const media = somaAvaliacoes / somaPesos;

      return {
        ...avaliacao,
        media_ponderada: parseFloat(media.toFixed(2)) // Adiciona a média calculada
      };
    });

    res.json({
      avaliacoes: avaliacoesComMedia,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    if (connection) connection.release();
  }
});


// app.post('/tribunais_avaliacao_usuario', async (req, res) => {
//   const { id_tribunal, id_usuario, av_eficiencia, av_qualidade, av_infraestrutura, av_tecnologia, av_gestao, av_transparencia, av_sustentabilidade } = req.body;

//   try {
//     // Calcular a média ponderada
//     const somaAvaliacoes = (
//       av_eficiencia * 5 +
//       av_qualidade * 4 +
//       av_infraestrutura * 3 +
//       av_tecnologia * 3 +
//       av_gestao * 2 +
//       av_transparencia * 2 +
//       av_sustentabilidade * 1
//     );
//     const somaPesos = 5 + 4 + 3 + 3 + 2 + 2 + 1;
//     const mediaGeral = somaAvaliacoes / somaPesos;

//     // Inserir nova avaliação com a média calculada
//     await db.promise().query(
//       `INSERT INTO av_tribunais (id_tribunal, id_usuario, av_eficiencia, av_qualidade, av_infraestrutura, av_tecnologia, av_gestao, av_transparencia, av_sustentabilidade, media_geral, data_criacao)
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
//       [id_tribunal, id_usuario, av_eficiencia, av_qualidade, av_infraestrutura, av_tecnologia, av_gestao, av_transparencia, av_sustentabilidade, parseFloat(mediaGeral.toFixed(2))]
//     );

//     res.status(201).json({ message: 'Avaliação salva com sucesso!', media_geral: parseFloat(mediaGeral.toFixed(2)) });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao salvar avaliação do usuário.' });
//   }
// });

// app.get('/tribunais_avaliacao_usuario/:id_tribunal/:id_usuario', async (req, res) => {
//   try {
//     const [avaliacoes] = await db.promise().query(
//       `SELECT media_geral 
//        FROM av_tribunais 
//        WHERE id_tribunal = ? AND id_usuario = ?
//        ORDER BY data_criacao DESC
//        LIMIT 1`,
//       [req.params.id_tribunal, req.params.id_usuario]
//     );

//     if (avaliacoes.length === 0) {
//       return res.json({
//         media_geral: null,
//         message: "Usuário ainda não avaliou este tribunal"
//       });
//     }

//     res.json({
//       media_geral: avaliacoes[0].media_geral
//     });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao buscar média de avaliações do usuário.' });
//   }
// });




//juiz
// app.post('/av_juiz', async (req, res) => {
//   const { id_usuario, id_juiz, numero_protocolo, comentario, avaliacao, horario_chegada, horario_saida } = req.body;

//   if (!avaliacao || avaliacao < 1 || avaliacao > 5) {
//     return res.status(400).json({ error: "Avaliação deve estar entre 1 e 5." });
//   }
//   if (!numero_protocolo || numero_protocolo.length < 5 || numero_protocolo.length > 20) {
//     return res.status(400).json({ error: "Número de protocolo deve ter entre 5 e 20 dígitos." });
//   }

//   try {
//     await db.promise().query(
//       'INSERT INTO av_juiz (id_usuario, id_juiz, numero_protocolo, comentario, avaliacao, horario_chegada, horario_saida) VALUES (?, ?, ?, ?, ?, ?, ?)',
//       [id_usuario, id_juiz, numero_protocolo, comentario || null, avaliacao, horario_chegada || null, horario_saida || null]
//     );
//     res.status(201).json({ message: 'Comentário e avaliação adicionados com sucesso.' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao adicionar o comentário e a avaliação.' });
//   }
// });

// Rota POST - Adicionar avaliação do juiz
app.post('/av_juiz', async (req, res) => {
  const { 
    id_usuario, 
    id_juiz, 
    numero_processo, 
    comentario,
    av_produtividade,
    av_fundamentacao,
    av_pontualidade,
    av_organizacao,
    av_atendimento,
    horario_chegada, 
    horario_saida,
    data_audiencia 
  } = req.body;

  // Validação dos campos de avaliação
  const avaliacoes = [
    av_produtividade,
    av_fundamentacao,
    av_pontualidade,
    av_organizacao,
    av_atendimento
  ];

  if (avaliacoes.some(av => av < 1 || av > 5)) {
    return res.status(400).json({ error: "Todas as avaliações devem estar entre 1 e 5." });
  }

  if (!numero_processo || numero_processo.length < 5 || numero_processo.length > 20) {
    return res.status(400).json({ error: "Número do processo deve ter entre 5 e 20 caracteres." });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query(
      `INSERT INTO av_juiz (
        id_usuario, id_juiz, numero_processo, comentario,
        av_produtividade, av_fundamentacao, av_pontualidade,
        av_organizacao, av_atendimento,
        horario_chegada, horario_saida, data_audiencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario, id_juiz, numero_processo, comentario,
        av_produtividade, av_fundamentacao, av_pontualidade,
        av_organizacao, av_atendimento,
        horario_chegada || null, horario_saida || null, data_audiencia || null
      ]
    );
    res.status(201).json({ message: 'Avaliação do juiz adicionada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação do juiz.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Calcular a média ponderada das avaliações de um juiz
app.get('/juiz_avaliacao/:id_juiz', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaJuiz(?)',
      [req.params.id_juiz]
    );
    res.json({ 
      media_ponderada: resultado[0][0]?.media_ponderada || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao calcular a média ponderada de avaliações.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de um juiz específico
app.get('/av_juiz/:id_juiz', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query(
      'SELECT * FROM av_juiz WHERE id_juiz = ?',
      [req.params.id_juiz]
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de um juiz
app.delete('/juiz_avaliacao/:id_juiz', async (req, res) => {
  const id_juiz = req.params.id_juiz;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_juiz WHERE id_juiz = ?', [id_juiz]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de um juiz (rota redundante)
app.delete('/av_juiz/:id_juiz', async (req, res) => {
  const id_juiz = req.params.id_juiz;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_juiz WHERE id_juiz = ?', [id_juiz]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de um juiz por usuário
app.get('/juiz_avaliacao_usuario/:id_juiz/:id_usuario', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    // Buscar as avaliações individuais do usuário
    const [avaliacoes] = await connection.query(
      `SELECT 
        av_produtividade,    
        av_fundamentacao,      
        av_pontualidade,       
        av_organizacao,        
        av_atendimento
      FROM av_juiz 
      WHERE id_juiz = ? AND id_usuario = ?
      ORDER BY data_criacao DESC`,
      [req.params.id_juiz, req.params.id_usuario]
    );

    if (avaliacoes.length === 0) {
      return res.json({
        avaliacoes: null,
        message: "Usuário ainda não avaliou este juiz"
      });
    }

    // Calcular a média geral das avaliações do usuário com pesos
    const avaliacoesComMedia = avaliacoes.map(avaliacao => {
      const somaAvaliacoes = (
        avaliacao.av_produtividade * 5 +
        avaliacao.av_fundamentacao * 4 +
        avaliacao.av_pontualidade * 3 +
        avaliacao.av_organizacao * 2 +
        avaliacao.av_atendimento * 1 
      );

      const somaPesos = 5 + 4 + 3 + 2 + 1; // Soma dos pesos
      const media = somaAvaliacoes / somaPesos;

      return {
        ...avaliacao,
        media_ponderada: parseFloat(media.toFixed(2)) // Adiciona a média calculada
      };
    });

    res.json({
      avaliacoes: avaliacoesComMedia,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    if (connection) connection.release();
  }
});


//mediador
// app.post('/av_mediador', async (req, res) => {
//   const { id_usuario, id_mediador, comentario, avaliacao, horario_chegada, horario_saida } = req.body;

//   if (!avaliacao || avaliacao < 1 || avaliacao > 5) {
//     return res.status(400).json({ error: "Avaliação deve estar entre 1 e 5." });
//   }

//   try {
//     await db.promise().query(
//       'INSERT INTO av_mediador (id_usuario, id_mediador, comentario, avaliacao, horario_chegada, horario_saida) VALUES (?, ?, ?, ?, ?, ?)',
//       [id_usuario, id_mediador, comentario || null, avaliacao, horario_chegada || null, horario_saida || null]
//     );
//     res.status(201).json({ message: 'Comentário e avaliação adicionados com sucesso.' });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao adicionar o comentário e a avaliação.' });
//   }
// });

// app.get('/mediador_avaliacao/:id_mediador', async (req, res) => {
//   try {
//     const [resultado] = await db.promise().query(
//       'SELECT ROUND(AVG(avaliacao),2) AS media_avaliacao FROM av_mediador WHERE id_mediador = ?',
//       [req.params.id_mediador]
//     );
//     res.json({ media_avaliacao: resultado[0].media_avaliacao || 0 });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao calcular a média de avaliações.' });
//   }
// });
// app.get('/av_mediador', (req, res) => {
//   const sql = 'SELECT * FROM av_mediador';
//   db.query(sql, (err, result) => {
//     if (err) throw err;
//     res.send(result);
//   });
// });

// Rota POST - Adicionar avaliação do mediador
app.post('/av_mediador', async (req, res) => {
  const { 
    id_usuario, 
    id_mediador, 
    numero_processo, 
    comentario,
    av_satisfacao,
    av_imparcialidade,
    av_conhecimento,
    av_pontualidade,
    av_organizacao,
    horario_chegada, 
    horario_saida,
    data_criacao 
  } = req.body;

  // Validação dos campos de avaliação
  const avaliacoes = [
    av_satisfacao,
    av_imparcialidade,
    av_conhecimento,
    av_pontualidade,
    av_organizacao
  ];

  if (avaliacoes.some(av => av < 1 || av > 5)) {
    return res.status(400).json({ error: "Todas as avaliações devem estar entre 1 e 5." });
  }

  if (!numero_processo || numero_processo.length < 5 || numero_processo.length > 20) {
    return res.status(400).json({ error: "Número do processo deve ter entre 5 e 20 caracteres." });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query(
      `INSERT INTO av_mediador (
        id_usuario, id_mediador, numero_processo, comentario,
        av_satisfacao, av_imparcialidade, av_conhecimento, av_pontualidade, av_organizacao,
        horario_chegada, horario_saida, data_criacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario, id_mediador, numero_processo, comentario,
        av_satisfacao, av_imparcialidade, av_conhecimento, av_pontualidade, av_organizacao,
        horario_chegada || null, horario_saida || null, data_criacao || null
      ]
    );
    res.status(201).json({ message: 'Avaliação do mediador adicionada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação do mediador.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Calcular a média ponderada das avaliações de um mediador
app.get('/mediador_avaliacao/:id_mediador', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaMediador(?)',
      [req.params.id_mediador]
    );
    res.json({ 
      media_ponderada: resultado[0][0]?.media_ponderada || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao calcular a média ponderada de avaliações.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de um mediador
app.delete('/mediador_avaliacao/:id_mediador', async (req, res) => {
  const id_mediador = req.params.id_mediador;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_mediador WHERE id_mediador = ?', [id_mediador]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de um mediador (rota redundante)
app.delete('/av_mediador/:id_mediador', async (req, res) => {
  const id_mediador = req.params.id_mediador;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_mediador WHERE id_mediador = ?', [id_mediador]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de um mediador por usuário
app.get('/mediador_avaliacao_usuario/:id_mediador/:id_usuario', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    // Buscar as avaliações individuais do usuário
    const [avaliacoes] = await connection.query(
      `SELECT 
        av_satisfacao,
        av_imparcialidade,
        av_conhecimento,
        av_pontualidade,
        av_organizacao
      FROM av_mediador 
      WHERE id_mediador = ? AND id_usuario = ?
      ORDER BY data_criacao DESC`,
      [req.params.id_mediador, req.params.id_usuario]
    );

    if (avaliacoes.length === 0) {
      return res.json({
        avaliacoes: null,
        message: "Usuário ainda não avaliou este mediador"
      });
    }

    // Calcular a média geral das avaliações do usuário com pesos
    const avaliacoesComMedia = avaliacoes.map(avaliacao => {
      const somaAvaliacoes = (
        avaliacao.av_satisfacao * 5 +
        avaliacao.av_imparcialidade * 4 +
        avaliacao.av_conhecimento * 3 +
        avaliacao.av_pontualidade * 2 +
        avaliacao.av_organizacao * 1 
      );

      const somaPesos = 5 + 4 + 3 + 2 + 1; // Soma dos pesos
      const media = somaAvaliacoes / somaPesos;

      return {
        ...avaliacao,
        media_ponderada: parseFloat(media.toFixed(2)) // Adiciona a média calculada
      };
    });

    res.json({
      avaliacoes: avaliacoesComMedia,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar todas as avaliações de um mediador
app.get('/av_mediador/:id_mediador', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query(
      'SELECT * FROM av_mediador WHERE id_mediador = ?',
      [req.params.id_mediador]
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});


// app.delete('/mediador_avaliacao/:id_mediador', (req, res) => {
//   const id_mediador = req.params.id_mediador;
//   db.query('DELETE FROM av_mediador WHERE id_mediador = ?', [id_mediador], (err, result) => {
//     if (err) {
//       return res.status(500).send({ error: 'Erro ao deletar avaliações' });
//     }
//     res.send({ message: 'Avaliações deletadas com sucesso' });
//   });
// });
// app.delete('/av_mediador/:id_mediador', (req, res) => {
//   const id_mediador = req.params.id_mediador;
//   db.query('DELETE FROM av_mediador WHERE id_mediador = ?', [id_mediador], (err, result) => {
//     if (err) {
//       return res.status(500).send({ error: 'Erro ao deletar avaliações' });
//     }
//     res.send({ message: 'Avaliações deletadas com sucesso' });
//   });
// });

//advocacia
// Rota POST - Adicionar avaliação da advocacia
app.post('/av_advocacia', async (req, res) => {
  const { 
    id_usuario, 
    id_advocacia, 
    numero_processo, 
    comentario,
    av_eficiencia_processual,
    av_qualidade_tecnica,
    av_etica_profissional,
    av_comunicacao,
    av_inovacao,
    horario_chegada, 
    horario_saida 
  } = req.body;

  // Validação dos campos de avaliação
  const avaliacoes = [
    av_eficiencia_processual,
    av_qualidade_tecnica,
    av_etica_profissional,
    av_comunicacao,
    av_inovacao
  ];

  if (avaliacoes.some(av => av < 1 || av > 5)) {
    return res.status(400).json({ error: "Todas as avaliações devem estar entre 1 e 5." });
  }

  if (!numero_processo || numero_processo.length < 5 || numero_processo.length > 20) {
    return res.status(400).json({ error: "Número do processo deve ter entre 5 e 20 dígitos." });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query(
      `INSERT INTO av_advocacia (
        id_usuario, id_advocacia, numero_processo, comentario,
        av_eficiencia_processual, av_qualidade_tecnica, av_etica_profissional,
        av_comunicacao, av_inovacao, horario_chegada, horario_saida
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario, id_advocacia, numero_processo, comentario,
        av_eficiencia_processual, av_qualidade_tecnica, av_etica_profissional,
        av_comunicacao, av_inovacao, horario_chegada || null, horario_saida || null
      ]
    );
    res.status(201).json({ message: 'Avaliação adicionada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Calcular a média ponderada das avaliações de uma advocacia
app.get('/advocacia_avaliacao/:id_advocacia', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaAdvocacia(?)',
      [req.params.id_advocacia]
    );
    res.json({ 
      media_ponderada: resultado[0][0]?.media_ponderada || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao calcular a média ponderada de avaliações.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar todas as avaliações de advocacia
app.get('/av_advocacia', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM av_advocacia');
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliação de uma advocacia por ID
app.get('/av_advocacia/:id_advocacia', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query(
      'SELECT * FROM av_advocacia WHERE id_advocacia = ?',
      [req.params.id_advocacia]
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de uma advocacia
app.delete('/advocacia_avaliacao/:id_advocacia', async (req, res) => {
  const id_advocacia = req.params.id_advocacia;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_advocacia WHERE id_advocacia = ?', [id_advocacia]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de uma advocacia (rota redundante)
app.delete('/av_advocacia/:id_advocacia', async (req, res) => {
  const id_advocacia = req.params.id_advocacia;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_advocacia WHERE id_advocacia = ?', [id_advocacia]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de uma advocacia feitas por um usuário
app.get('/advocacia_avaliacao_usuario/:id_advocacia/:id_usuario', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    // Buscar as avaliações individuais do usuário
    const [avaliacoes] = await connection.query(
      `SELECT 
        av_eficiencia_processual,
        av_qualidade_tecnica,
        av_etica_profissional,
        av_comunicacao,
        av_inovacao
      FROM av_advocacia 
      WHERE id_advocacia = ? AND id_usuario = ?
      ORDER BY data_criacao DESC`,
      [req.params.id_advocacia, req.params.id_usuario]
    );

    if (avaliacoes.length === 0) {
      return res.json({
        avaliacoes: null,
        message: "Usuário ainda não avaliou esta advocacia"
      });
    }

    // Calcular a média geral das avaliações do usuário com pesos
    const avaliacoesComMedia = avaliacoes.map(avaliacao => {
      const somaAvaliacoes = (
        avaliacao.av_eficiencia_processual * 5 +
        avaliacao.av_qualidade_tecnica * 4 +
        avaliacao.av_etica_profissional * 3 +
        avaliacao.av_comunicacao * 2 +
        avaliacao.av_inovacao * 1 
      );

      const somaPesos = 5 + 4 + 3 + 2 + 1; // Soma dos pesos
      const media = somaAvaliacoes / somaPesos;

      return {
        ...avaliacao,
        media_ponderada: parseFloat(media.toFixed(2)) // Adiciona a média calculada
      };
    });

    res.json({
      avaliacoes: avaliacoesComMedia,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    if (connection) connection.release();
  }
});


//portal
// Rota POST - Adicionar avaliação do portal
app.post('/av_portal', async (req, res) => {
  const {
    id_usuario,
    id_portal,
    comentario,
    av_seguranca_sistema,
    av_usabilidade,
    av_integracao,
    av_atualizacao,
    av_acessibilidade
  } = req.body;

  // Validação dos campos de avaliação
  const avaliacoes = [
    av_seguranca_sistema,
    av_usabilidade,
    av_integracao,
    av_atualizacao,
    av_acessibilidade
  ];

  if (avaliacoes.some(av => av < 1 || av > 5)) {
    return res.status(400).json({ error: "Todas as avaliações devem estar entre 1 e 5." });
  }

  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query(
      `INSERT INTO av_portal (
        id_usuario, id_portal, comentario,
        av_seguranca_sistema, av_usabilidade, av_integracao,
        av_atualizacao, av_acessibilidade
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario, id_portal, comentario,
        av_seguranca_sistema, av_usabilidade, av_integracao,
        av_atualizacao, av_acessibilidade
      ]
    );
    res.status(201).json({ message: 'Avaliação adicionada com sucesso.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Calcular a média ponderada das avaliações de um portal
app.get('/portal_avaliacao/:id_portal', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaPortal(?)',
      [req.params.id_portal]
    );
    res.json({
      media_ponderada: resultado[0][0]?.media_ponderada || 0
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao calcular a média ponderada de avaliações.' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar todas as avaliações do portal
app.get('/av_portal', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query('SELECT * FROM av_portal');
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de um portal específico
app.get('/av_portal/:id_portal', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    const [result] = await connection.query(
      'SELECT * FROM av_portal WHERE id_portal = ?',
      [req.params.id_portal]
    );
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de um portal
app.delete('/portal_avaliacao/:id_portal', async (req, res) => {
  const id_portal = req.params.id_portal;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_portal WHERE id_portal = ?', [id_portal]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota DELETE - Deletar avaliações de um portal (rota redundante)
app.delete('/av_portal/:id_portal', async (req, res) => {
  const id_portal = req.params.id_portal;
  let connection;
  try {
    connection = await db.promise().getConnection();
    await connection.query('DELETE FROM av_portal WHERE id_portal = ?', [id_portal]);
    res.send({ message: 'Avaliações deletadas com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).send({ error: 'Erro ao deletar avaliações' });
  } finally {
    if (connection) connection.release();
  }
});

// Rota GET - Buscar avaliações de um portal feitas por um usuário específico
app.get('/portal_avaliacao_usuario/:id_portal/:id_usuario', async (req, res) => {
  let connection;
  try {
    connection = await db.promise().getConnection();
    // Buscar as avaliações individuais do usuário
    const [avaliacoes] = await connection.query(
      `SELECT 
        av_seguranca_sistema,
        av_usabilidade,
        av_integracao,
        av_atualizacao,
        av_acessibilidade
      FROM av_portal 
      WHERE id_portal = ? AND id_usuario = ?
      ORDER BY data_criacao DESC`,
      [req.params.id_portal, req.params.id_usuario]
    );

    if (avaliacoes.length === 0) {
      return res.json({
        avaliacoes: null,
        message: "Usuário ainda não avaliou este portal"
      });
    }

    // Calcular a média geral das avaliações do usuário com pesos
    const avaliacoesComMedia = avaliacoes.map(avaliacao => {
      const somaAvaliacoes = (
        avaliacao.av_seguranca_sistema * 5 +
        avaliacao.av_usabilidade * 4 +
        avaliacao.av_integracao * 3 +
        avaliacao.av_atualizacao * 2 +
        avaliacao.av_acessibilidade * 1 
      );

      const somaPesos = 5 + 4 + 3 + 2 + 1; // Soma dos pesos
      const media = somaAvaliacoes / somaPesos;

      return {
        ...avaliacao,
        media_ponderada: parseFloat(media.toFixed(2)) // Adiciona a média calculada
      };
    });

    res.json({
      avaliacoes: avaliacoesComMedia,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    if (connection) connection.release();
  }
});





app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).send({ error: 'Arquivo muito grande. Máximo de 5MB permitido.' });
    }
    return res.status(400).send({ error: err.message });
  }
  next(err);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Servidor backend rodando na porta ${PORT}`);
});
// Encerrar o pool de conexões ao desligar o servidor
process.on('SIGTERM', () => {
  db.end()
    .then(() => {
      console.log('Servidor encerrado e conexões liberadas');
      process.exit(0);
    })
    .catch(err => {
      console.error('Erro ao encerrar pool de conexões:', err);
      process.exit(1);
    });
});
