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

// Rota para upload de imagens genérica
app.post('/upload/:type', upload.single('image'), (req, res) => {
  if (req.file) {
    res.send({ message: 'Arquivo enviado com sucesso!', file: req.file });
  } else {
    res.status(400).send({ message: 'Erro ao enviar o arquivo.' });
  }
});

// Servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Função auxiliar para deletar arquivo de imagem
const deleteImage = (imagePath) => {
  if (!imagePath) return;
  
  const fullPath = path.join(__dirname, imagePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

// ROTAS PARA FÓRUNS
app.get('/foruns', (req, res) => {
  const sql = 'SELECT * FROM foruns';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.post('/foruns', upload.single('imagem'), (req, res) => {
  const { nome, cidade, estado, endereco, cep, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/foruns/${req.file.filename}` : null;

  if (!nome || !cidade || !estado || !cep || !avaliacao_media) {
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  const sql = 'INSERT INTO foruns (nome, cidade, estado, endereco, cep, avaliacao_media, imagem) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.query(sql, [nome, cidade, estado, endereco, cep, avaliacao_media, imagem], (err, result) => {
    if (err) {
      console.error('Erro ao inserir fórum:', err);
      return res.status(500).send({ error: 'Erro ao inserir fórum' });
    }
    res.send({ ...result, imagem });
  });
});

app.put('/foruns/:id', upload.single('imagem'), (req, res) => {
  const id = req.params.id;
  const { nome, cidade, estado, endereco, cep, avaliacao_media } = req.body;
  
  db.query('SELECT imagem FROM foruns WHERE id_forum = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar fórum' });
    }

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/foruns/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE foruns 
      SET nome = ?, cidade = ?, estado = ?, endereco = ?, 
          cep = ?, avaliacao_media = ?, imagem = ?
      WHERE id_forum = ?
    `;

    db.query(
      sql, 
      [nome, cidade, estado, endereco, cep, avaliacao_media, novaImagem, id],
      (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao atualizar fórum' });
        }

        if (req.file && antigaImagem) {
          deleteImage(antigaImagem);
        }

        res.send({ message: 'Fórum atualizado com sucesso' });
      }
    );
  });
});

app.delete('/foruns/:id', (req, res) => {
  const id = req.params.id;

  // Primeiro, buscar a imagem do forum
  db.query('SELECT imagem FROM foruns WHERE id_forum = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar forum' });
    }

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    db.query('  FROM av_foruns WHERE id_forum = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).send({ error: 'Erro ao deletar avaliações associadas' });
      }

      // Deletar o forum
      db.query('DELETE FROM foruns WHERE id_forum = ?', [id], (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao deletar forum' });
        }

        // Se existir uma imagem, deletá-la
        if (imagem) {
          deleteImage(imagem);
        }

        res.send({ message: 'Forum, suas avaliações e imagem deletados com sucesso' });
      });
    });
  });
});

app.get('/foruns/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM foruns WHERE id_forum = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar forum' });
    }
    if (result.length === 0) {
      return res.status(404).send({ error: 'forum não encontrado' });
    }
    res.send(result[0]);
  });
});

// ROTAS PARA TRIBUNAIS
app.get('/tribunais', (req, res) => {
  const sql = 'SELECT * FROM tribunais';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.get('/tokens', (req, res) => {
  const sql = 'SELECT * FROM user_tokens';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.get('/tribunais/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM tribunais WHERE id_tribunal = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar tribunal' });
    }
    if (result.length === 0) {
      return res.status(404).send({ error: 'Tribunal não encontrado' });
    }
    res.send(result[0]);
  });
});



app.post('/tribunais', upload.single('imagem'), (req, res) => {
  const { nome, cidade, estado, endereco, cep, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/tribunais/${req.file.filename}` : null;

  if (!nome || !cidade || !estado || !cep || !avaliacao_media) {
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  const sql = 'INSERT INTO tribunais (nome, cidade, estado, endereco, cep, avaliacao_media, imagem) VALUES (?, ?, ?, ?, ?, ?, ?)';
  db.query(sql, [nome, cidade, estado, endereco, cep, avaliacao_media, imagem], (err, result) => {
    if (err) {
      console.error('Erro ao inserir tribunal:', err);
      return res.status(500).send({ error: 'Erro ao inserir tribunal' });
    }
    res.send({ ...result, imagem });
  });
});

app.put('/tribunais/:id', upload.single('imagem'), (req, res) => {
  const id = req.params.id;
  const { nome, cidade, estado, endereco, cep, avaliacao_media } = req.body;
  
  db.query('SELECT imagem FROM tribunais WHERE id_tribunal = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar tribunal' });
    }

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/tribunais/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE tribunais 
      SET nome = ?, cidade = ?, estado = ?, endereco = ?, 
          cep = ?, avaliacao_media = ?, imagem = ?
      WHERE id_tribunal = ?
    `;

    db.query(
      sql, 
      [nome, cidade, estado, endereco, cep, avaliacao_media, novaImagem, id],
      (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao atualizar tribunal' });
        }

        if (req.file && antigaImagem) {
          deleteImage(antigaImagem);
        }

        res.send({ message: 'Tribunal atualizado com sucesso' });
      }
    );
  });
});

app.delete('/tribunais/:id', (req, res) => {
  const id = req.params.id;

  // Primeiro, buscar a imagem do tribunal
  db.query('SELECT imagem FROM tribunais WHERE id_tribunal = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar tribunal' });
    }

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    db.query('DELETE FROM av_tribunais WHERE id_tribunal = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).send({ error: 'Erro ao deletar avaliações associadas' });
      }

      // Deletar o tribunal
      db.query('DELETE FROM tribunais WHERE id_tribunal = ?', [id], (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao deletar tribunal' });
        }

        // Se existir uma imagem, deletá-la
        if (imagem) {
          deleteImage(imagem);
        }

        res.send({ message: 'Tribunal, suas avaliações e imagem deletados com sucesso' });
      });
    });
  });
});

// ROTAS PARA JUIZ
app.get('/juiz', (req, res) => {
  const sql = 'SELECT * FROM juiz';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.get('/juiz/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM juiz WHERE id_juiz = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar juiz' });
    }
    if (result.length === 0) {
      return res.status(404).send({ error: 'juiz não encontrado' });
    }
    res.send(result[0]);
  });
});

app.post('/juiz', upload.single('imagem'), (req, res) => {
  const { nome, tempo_servico, casos_julgados, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/juiz/${req.file.filename}` : null;

  if (!nome || !tempo_servico || !casos_julgados || !avaliacao_media) {
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  const sql = 'INSERT INTO juiz (nome, tempo_servico, casos_julgados, avaliacao_media, imagem) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [nome, tempo_servico, casos_julgados, avaliacao_media, imagem], (err, result) => {
    if (err) {
      console.error('Erro ao inserir juiz:', err);
      return res.status(500).send({ error: 'Erro ao inserir juiz' });
    }
    res.send({ ...result, imagem });
  });
});

app.put('/juiz/:id', upload.single('imagem'), (req, res) => {
  const id = req.params.id;
  const { nome, tempo_servico, casos_julgados, avaliacao_media } = req.body;
  
  db.query('SELECT imagem FROM juiz WHERE id_juiz = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar juiz' });
    }

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/juiz/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE juiz 
      SET nome = ?, tempo_servico = ?, casos_julgados = ?, 
          avaliacao_media = ?, imagem = ?
      WHERE id_juiz = ?
    `;

    db.query(
      sql, 
      [nome, tempo_servico, casos_julgados, avaliacao_media, novaImagem, id],
      (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao atualizar juiz' });
        }

        if (req.file && antigaImagem) {
          deleteImage(antigaImagem);
        }

        res.send({ message: 'Juiz atualizado com sucesso' });
      }
    );
  });
});

app.delete('/juiz/:id', (req, res) => {
  const id = req.params.id;

  // Primeiro, buscar a imagem do juiz
  db.query('SELECT imagem FROM juiz WHERE id_juiz = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar juiz' });
    }

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    db.query('DELETE FROM av_juiz WHERE id_juiz = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).send({ error: 'Erro ao deletar avaliações associadas' });
      }

      // Deletar o juiz
      db.query('DELETE FROM juiz WHERE id_juiz = ?', [id], (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao deletar juiz' });
        }

        // Se existir uma imagem, deletá-la
        if (imagem) {
          deleteImage(imagem);
        }

        res.send({ message: 'Juiz, suas avaliações e imagem deletados com sucesso' });
      });
    });
  });
});

// ROTAS PARA MEDIADOR
app.get('/mediador', (req, res) => {
  const sql = 'SELECT * FROM mediador';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.get('/mediador/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM mediador WHERE id_mediador = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar mediador' });
    }
    if (result.length === 0) {
      return res.status(404).send({ error: 'mediador não encontrado' });
    }
    res.send(result[0]);
  });
});


app.post('/mediador', upload.single('imagem'), (req, res) => {
  const { nome, estado, avaliacao_media } = req.body;
  const imagem = req.file ? `/uploads/mediador/${req.file.filename}` : null;

  if (!nome || !estado || !avaliacao_media) {
    return res.status(400).send({ error: 'Todos os campos obrigatórios devem ser preenchidos' });
  }

  const sql = 'INSERT INTO mediador (nome, estado, avaliacao_media, imagem) VALUES (?, ?, ?, ?)';
  db.query(sql, [nome, estado, avaliacao_media, imagem], (err, result) => {
    if (err) {
      console.error('Erro ao inserir mediador:', err);
      return res.status(500).send({ error: 'Erro ao inserir mediador' });
    }
    res.send({ ...result, imagem });
  });
});

app.put('/mediador/:id', upload.single('imagem'), (req, res) => {
  const id = req.params.id;
  const { nome, estado, avaliacao_media } = req.body;
  
  db.query('SELECT imagem FROM mediador WHERE id_mediador = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar mediador' });
    }

    const antigaImagem = result[0]?.imagem;
    const novaImagem = req.file ? `/uploads/mediador/${req.file.filename}` : antigaImagem;

    const sql = `
      UPDATE mediador 
      SET nome = ?, estado = ?, avaliacao_media = ?, imagem = ?
      WHERE id_mediador = ?
    `;

    db.query(
      sql, 
      [nome, estado, avaliacao_media, novaImagem, id],
      (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao atualizar mediador' });
        }

        if (req.file && antigaImagem) {
          deleteImage(antigaImagem);
        }

        res.send({ message: 'Mediador atualizado com sucesso' });
      }
    );
  });
});

app.delete('/mediador/:id', (req, res) => {
  const id = req.params.id;

  // Primeiro, buscar a imagem do mediador
  db.query('SELECT imagem FROM mediador WHERE id_mediador = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar mediador' });
    }

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    db.query('DELETE FROM av_mediador WHERE id_mediador = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).send({ error: 'Erro ao deletar avaliações associadas' });
      }

      // Deletar o mediador
      db.query('DELETE FROM mediador WHERE id_mediador = ?', [id], (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao deletar mediador' });
        }

        // Se existir uma imagem, deletá-la
        if (imagem) {
          deleteImage(imagem);
        }

        res.send({ message: 'Mediador, suas avaliações e imagem deletados com sucesso' });
      });
    });
  });
});


// GET all advogados
app.get('/advocacia', (req, res) => {
  const sql = 'SELECT * FROM advocacia';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.get('/advocacia/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM advocacia WHERE id_advocacia = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar advocacia' });
    }
    if (result.length === 0) {
      return res.status(404).send({ error: 'advocacia não encontrado' });
    }
    res.send(result[0]);
  });
});

// POST new advogado
app.post('/advocacia', upload.single('imagem'), (req, res) => {
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

  const sql = `
    INSERT INTO advocacia 
    (nome, profissao, experiencia, escritorio, endereco, imagem, avaliacao_media) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql, 
    [
      nome, 
      profissao, 
      experiencia || null, 
      escritorio || null, 
      endereco || null, 
      imagem,
      avaliacaoNumero
    ], 
    (err, result) => {
      if (err) {
        console.error('Erro ao inserir advogado:', err);
        return res.status(500).send({ error: 'Erro ao inserir advogado' });
      }
      res.send({ ...result, imagem, avaliacao_media: avaliacaoNumero });
    }
  );
});

// PUT update advogado
app.put('/advocacia/:id', upload.single('imagem'), (req, res) => {
  const id = req.params.id;
  const { nome, profissao, experiencia, escritorio, endereco, avaliacao_media } = req.body;
  
  // Log de todos os dados recebidos para depuração
  console.log('Dados recebidos:', req.body);
  console.log('Arquivo de imagem:', req.file);

  // Validação da avaliação média
  const avaliacaoNumero = Number(avaliacao_media);
  if (isNaN(avaliacaoNumero) || avaliacaoNumero < 0 || avaliacaoNumero > 10) {
    return res.status(400).send({ error: 'Avaliação média deve ser um número entre 0 e 10' });
  }

  db.query('SELECT imagem FROM advocacia WHERE id_advocacia = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar advogado' });
    }

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

    db.query(
      sql, 
      [
        nome, 
        profissao, 
        experiencia || null, 
        escritorio || null, 
        endereco || null, 
        novaImagem,
        avaliacaoNumero,
        id
      ],
      (err, result) => {
        if (err) {
          console.error('Erro ao atualizar advogado:', err);
          return res.status(500).send({ error: 'Erro ao atualizar advogado' });
        }

        if (req.file && antigaImagem) {
          deleteImage(antigaImagem);
        }

        res.send({ 
          message: 'Advogado atualizado com sucesso',
          avaliacao_media: avaliacaoNumero
        });
      }
    );
  });
});

// Rota para buscar por profissão específica
app.get('/advocacia/profissao/:profissao', (req, res) => {
  const profissao = req.params.profissao;
  const sql = 'SELECT * FROM advocacia WHERE profissao = ?';
  
  db.query(sql, [profissao], (err, result) => {
    if (err) {
      console.error('Erro ao buscar por profissão:', err);
      return res.status(500).send({ error: 'Erro ao buscar por profissão' });
    }
    res.send(result);
  });
});

app.delete('/advocacia/:id', (req, res) => {
  const id = req.params.id;

  // Primeiro, buscar a imagem do advocacia
  db.query('SELECT imagem FROM advocacia WHERE id_advocacia = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar advocacia' });
    }

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    db.query('DELETE FROM av_advocacia WHERE id_advocacia = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).send({ error: 'Erro ao deletar avaliações associadas' });
      }

      // Deletar o advocacia
      db.query('DELETE FROM advocacia WHERE id_advocacia = ?', [id], (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao deletar advocacia' });
        }

        // Se existir uma imagem, deletá-la
        if (imagem) {
          deleteImage(imagem);
        }

        res.send({ message: 'Advocacia, suas avaliações e imagem deletados com sucesso' });
      });
    });
  });
});


app.get('/portais', (req, res) => {
  const sql = 'SELECT id_portal, nome, url, imagem, avaliacao_media FROM portal';
  db.query(sql, (err, result) => {
    if (err) {
      console.error('Erro ao buscar portais:', err);
      return res.status(500).send({ error: 'Erro ao buscar portais', details: err.message });
    }
    // Log para debug
    console.log('Portais encontrados:', result);
    res.send(result);
  });
});

app.get('/portais/:id', (req, res) => {
  const id = req.params.id;
  const sql = 'SELECT * FROM portal WHERE id_portal = ?';
  db.query(sql, [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar portal' });
    }
    if (result.length === 0) {
      return res.status(404).send({ error: 'portal não encontrado' });
    }
    res.send(result[0]);
  });
});

// Rota POST - Criar portal com validação de URL
app.post('/portais', upload.single('imagem'), async (req, res) => {
  let connection;
  try {
    console.log('Dados recebidos:', req.body);

    const { nome, url, avaliacao_media } = req.body;
    const imagem = req.file ? `/uploads/portais/${req.file.filename}` : null;

    // Validação mais rigorosa dos campos
    if (!nome || !url) {
      if (req.file) {
        deleteImage(`/uploads/portais/${req.file.filename}`);
      }
      return res.status(400).send({ 
        error: 'Nome e URL são obrigatórios',
        receivedData: { nome, url }
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

    // Obter conexão do pool
    connection = await db.getConnection();

    const sql = 'INSERT INTO portal (nome, url, imagem, avaliacao_media) VALUES (?, ?, ?, ?)';
    const values = [
      nome,
      url,
      imagem,
      avaliacao_media || '2.00'
    ];

    console.log('SQL:', sql);
    console.log('Valores:', values);

    // Inserir o novo portal
    const [result] = await connection.query(sql, values);

    // Buscar o registro recém-inserido para confirmar
    const [selectResult] = await connection.query(
      'SELECT * FROM portal WHERE id_portal = ?',
      [result.insertId]
    );

    console.log('Portal inserido:', selectResult[0]);
    res.status(201).send(selectResult[0]);

  } catch (error) {
    console.error('Erro na operação:', error);
    
    // Limpar arquivo enviado em caso de erro
    if (req.file) {
      deleteImage(`/uploads/portais/${req.file.filename}`);
    }

    const errorResponse = {
      error: 'Erro ao processar a requisição',
      details: error.message
    };

    // Adicionar informações extras de debug se for erro de SQL
    if (error.sql) {
      errorResponse.sql = error.sql;
      errorResponse.sqlMessage = error.sqlMessage;
    }

    res.status(500).send(errorResponse);

  } finally {
    if (connection) {
      connection.release();  // Libera a conexão ao pool apenas se ela foi obtida
    }
  }
});

// Rota PUT - Atualizar portal com validação de URL
app.put('/portais/:id', upload.single('imagem'), async (req, res) => {
  let connection;
  try {
    console.log('Dados de atualização recebidos:', req.body);
    
    const id = req.params.id;
    const { nome, url, avaliacao_media } = req.body;

    // Validar URL se fornecida
    if (url) {
      try {
        new URL(url);
      } catch (e) {
        return res.status(400).send({ error: 'URL inválida' });
      }
    }
    
    // Obter conexão do pool
    connection = await db.getConnection();
    
    // Verificar se o portal existe
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
    console.log('Portal atualizado:', finalResult[0]);
    res.send(finalResult[0]);

  } catch (error) {
    console.error('Erro na operação:', error);
    if (req.file) {
      deleteImage(`/uploads/portais/${req.file.filename}`);
    }
    res.status(500).send({ 
      error: 'Erro ao processar a requisição', 
      details: error.message 
    });
  } finally {
    if (connection) {
      connection.release();  // Libera a conexão ao pool apenas se ela foi obtida
    }
  }
});
// Rota GET - Buscar portais com base em um termo de pesquisa
app.get('/portais/search', (req, res) => {
  const searchTerm = req.query.term;

  // Consulta SQL para filtrar os registros que contenham o termo
  const sql = `
    SELECT id_portal, nome, url, imagem, avaliacao_media
    FROM portal
    WHERE nome LIKE ? OR url LIKE ?
  `;

  const values = [`%${searchTerm}%`, `%${searchTerm}%`];

  db.query(sql, values, (err, result) => {
    if (err) {
      console.error('Erro ao buscar portais:', err);
      return res.status(500).send({ error: 'Erro ao buscar portais' });
    }
    res.send(result);
  });
});

app.delete('/portais/:id', (req, res) => {
  const id = req.params.id;

  // Primeiro, buscar a imagem do portal
  db.query('SELECT imagem FROM portal WHERE id_portal = ?', [id], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao buscar portal' });
    }

    const imagem = result[0]?.imagem;

    // Deletar as avaliações associadas
    db.query('DELETE FROM av_portal WHERE id_portal = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).send({ error: 'Erro ao deletar avaliações associadas' });
      }

      // Deletar o portal
      db.query('DELETE FROM portal WHERE id_portal = ?', [id], (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Erro ao deletar portal' });
        }

        // Se existir uma imagem, deletá-la
        if (imagem) {
          deleteImage(imagem);
        }

        res.send({ message: 'Portal, suas avaliações e imagem deletados com sucesso' });
      });
    });
  });
});




//usuarios


app.get('/usuarios', (req, res) => {
  const sql = 'SELECT * FROM usuarios';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.post('/usuarios', async (req, res) => {
  let connection;
  try {
    console.log('Recebendo requisição de cadastro:', req.body);

    const { cpf, nome, email, senha, telefone } = req.body;

    // Validação dos campos obrigatórios
    if (!cpf || !nome || !email || !senha) {
      console.log('Campos obrigatórios faltando');
      return res.status(400).send({ 
        error: 'Todos os campos obrigatórios devem ser preenchidos',
        missingFields: Object.entries({ cpf, nome, email, senha })
          .filter(([_, value]) => !value)
          .map(([key]) => key)
      });
    }

    // Obter conexão do pool
    connection = await db.getConnection();

    // Verificar se o usuário já existe
    const sqlCheck = 'SELECT * FROM usuarios WHERE cpf = ? OR email = ?';
    const [existingUsers] = await connection.query(sqlCheck, [cpf, email]);

    if (existingUsers.length > 0) {
      console.log('Usuário já existe');
      const duplicateField = existingUsers[0].cpf === cpf ? 'CPF' : 'email';
      return res.status(400).send({ 
        error: `Já existe um usuário cadastrado com este ${duplicateField}` 
      });
    }

    // Criptografar a senha
    const hashedSenha = await bcrypt.hash(senha, 10);

    // Inserir usuário
    const sql = `
      INSERT INTO usuarios 
        (cpf, nome, email, senha, telefone) 
      VALUES 
        (?, ?, ?, ?, ?)
    `;

    const [insertResult] = await connection.query(sql, [
      cpf, 
      nome, 
      email, 
      hashedSenha, 
      telefone
    ]);

    console.log('Usuário cadastrado com sucesso:', {
      id: insertResult.insertId,
      cpf,
      email
    });

    // Buscar o usuário recém-criado (sem retornar a senha)
    const [newUser] = await connection.query(
      'SELECT id_usuario, cpf, nome, email, telefone FROM usuarios WHERE id_usuario = ?',
      [insertResult.insertId]
    );

    res.status(201).send({
      message: 'Usuário cadastrado com sucesso',
      usuario: newUser[0]
    });

  } catch (error) {
    console.error('Erro na operação:', error);

    // Determinar o tipo de erro para retornar uma mensagem apropriada
    let statusCode = 500;
    let errorMessage = 'Erro ao processar cadastro';

    if (error.code === 'ER_DUP_ENTRY') {
      statusCode = 400;
      errorMessage = 'Dados únicos duplicados (CPF ou email)';
    } else if (error.code === 'ER_BAD_NULL_ERROR') {
      statusCode = 400;
      errorMessage = 'Campos obrigatórios não preenchidos';
    }

    res.status(statusCode).send({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });

  } finally {
    if (connection) {
      try {
        connection.release();
      } catch (releaseError) {
        console.error('Erro ao liberar conexão:', releaseError);
      }
    }
  }
});

// Adicione esta rota no seu server.js
app.get('/api/usuario/:id', (req, res) => {
  const userId = req.params.id;

  const sql = 'SELECT id_usuario, nome, email, role FROM usuarios WHERE id_usuario = ?';
  db.query(sql, [userId], (err, result) => {
    if (err) {
      console.error('Erro ao buscar dados do usuário:', err);
      return res.status(500).send({ error: 'Erro interno do servidor' });
    }
    
    if (result.length === 0) {
      return res.status(404).send({ error: 'Usuário não encontrado' });
    }

    res.json(result[0]);
  });
});

// Login de usuário
// server.js - Rota de login modificada
app.post('/login', async (req, res) => {
  let connection;
  try {
    const { email, senha } = req.body;

    // Validação básica
    if (!email || !senha) {
      console.log('Tentativa de login sem credenciais completas');
      return res.status(400).json({ 
        error: 'Email e senha são obrigatórios',
        missingFields: {
          email: !email,
          senha: !senha
        }
      });
    }

    // Obter conexão do pool
    connection = await db.getConnection();

    // Buscar usuário
    const sql = `
      SELECT 
        id_usuario,
        nome,
        email,
        senha,
        role,
        cpf,
        telefone
      FROM usuarios 
      WHERE email = ?
    `;
    
    const [users] = await connection.query(sql, [email]);
    
    if (users.length === 0) {
      console.log(`Tentativa de login com email não cadastrado: ${email}`);
      return res.status(400).json({ 
        error: 'Credenciais inválidas'  // Mensagem genérica por segurança
      });
    }

    const usuario = users[0];
    
    // Verificar senha
    const isMatch = await bcrypt.compare(senha, usuario.senha);
    
    if (!isMatch) {
      console.log(`Senha incorreta para o email: ${email}`);
      return res.status(400).json({ 
        error: 'Credenciais inválidas'  // Mensagem genérica por segurança
      });
    }

    // Gerar token JWT
    const tokenPayload = {
      id: usuario.id_usuario,
      role: usuario.role,
      nome: usuario.nome,
      email: usuario.email  // Opcional: incluir email no token
    };

    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRATION || '1h',
        algorithm: 'HS256'
      }
    );

    // Log de login bem-sucedido
    console.log(`Login bem-sucedido para usuário: ${usuario.email}`);

    // Remover senha dos dados do usuário
    const { senha: _, ...userWithoutPassword } = usuario;

    res.json({
      message: 'Login realizado com sucesso',
      token,
      user: userWithoutPassword
    });

  } catch (error) {
    console.error('Erro no processo de login:', error);
    
    // Tratamento específico de erros
    if (error.code === 'ECONNREFUSED') {
      return res.status(503).json({ 
        error: 'Serviço temporariamente indisponível' 
      });
    }

    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });

  } finally {
    if (connection) {
      try {
        await connection.release();
      } catch (releaseError) {
        console.error('Erro ao liberar conexão:', releaseError);
      }
    }
  }
});


// Exemplo de rota protegida





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
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao adicionar o comentário e a avaliação.' });
//   }
// });

app.post('/av_foruns', async (req, res) => {
  let connection;
  try {
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

    // Validação dos campos obrigatórios
    const camposObrigatorios = {
      id_usuario,
      id_forum,
      numero_protocolo,
      av_atendimento,
      av_organizacao,
      av_digital,
      av_infraestrutura,
      av_seguranca
    };

    const camposFaltantes = Object.entries(camposObrigatorios)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (camposFaltantes.length > 0) {
      return res.status(400).json({
        error: "Campos obrigatórios não preenchidos",
        campos: camposFaltantes
      });
    }

    // Validação das avaliações
    const avaliacoes = {
      av_atendimento,
      av_organizacao,
      av_digital,
      av_infraestrutura,
      av_seguranca
    };

    const avaliacoesInvalidas = Object.entries(avaliacoes)
      .filter(([_, value]) => value < 1 || value > 5 || !Number.isInteger(value))
      .map(([key]) => key);

    if (avaliacoesInvalidas.length > 0) {
      return res.status(400).json({
        error: "Avaliações devem ser números inteiros entre 1 e 5",
        avaliacoesInvalidas
      });
    }

    // Validação do protocolo
    if (!numero_protocolo || numero_protocolo.length < 5 || numero_protocolo.length > 20) {
      return res.status(400).json({
        error: "Número de protocolo inválido",
        details: "Deve ter entre 5 e 20 caracteres",
        received: numero_protocolo
      });
    }

    // Validação dos horários
    if (horario_chegada && horario_saida) {
      const chegada = new Date(horario_chegada);
      const saida = new Date(horario_saida);

      if (isNaN(chegada.getTime()) || isNaN(saida.getTime())) {
        return res.status(400).json({
          error: "Formato de horário inválido",
          format: "YYYY-MM-DD HH:MM:SS"
        });
      }

      if (saida < chegada) {
        return res.status(400).json({
          error: "Horário de saída não pode ser anterior ao horário de chegada"
        });
      }
    }

    // Obter conexão do pool
    connection = await db.getConnection();

    // Verificar se usuário existe
    const [usuarios] = await connection.query(
      'SELECT id_usuario FROM usuarios WHERE id_usuario = ?',
      [id_usuario]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({
        error: "Usuário não encontrado"
      });
    }

    // Verificar se fórum existe
    const [foruns] = await connection.query(
      'SELECT id_forum FROM forum WHERE id_forum = ?',
      [id_forum]
    );

    if (foruns.length === 0) {
      return res.status(404).json({
        error: "Fórum não encontrado"
      });
    }

    // Verificar se já existe avaliação do mesmo usuário para este fórum
    const [avaliacaoExistente] = await connection.query(
      'SELECT id_avaliacao FROM av_foruns WHERE id_usuario = ? AND id_forum = ?',
      [id_usuario, id_forum]
    );

    if (avaliacaoExistente.length > 0) {
      return res.status(400).json({
        error: "Usuário já avaliou este fórum",
        avaliacao_id: avaliacaoExistente[0].id_avaliacao
      });
    }

    // Inserir avaliação
    const sql = `
      INSERT INTO av_foruns (
        id_usuario, id_forum, numero_protocolo, comentario,
        av_atendimento, av_organizacao, av_digital,
        av_infraestrutura, av_seguranca,
        horario_chegada, horario_saida,
        data_avaliacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await connection.query(sql, [
      id_usuario,
      id_forum,
      numero_protocolo,
      comentario || null,
      av_atendimento,
      av_organizacao,
      av_digital,
      av_infraestrutura,
      av_seguranca,
      horario_chegada || null,
      horario_saida || null
    ]);

    // Buscar avaliação inserida
    const [novaAvaliacao] = await connection.query(
      'SELECT * FROM av_foruns WHERE id_avaliacao = ?',
      [result.insertId]
    );

    console.log(`Nova avaliação registrada: ID ${result.insertId}`);

    res.status(201).json({
      message: "Avaliação registrada com sucesso",
      avaliacao: novaAvaliacao[0]
    });

  } catch (error) {
    console.error('Erro ao registrar avaliação:', error);

    let statusCode = 500;
    let errorMessage = 'Erro ao registrar avaliação';

    if (error.code === 'ER_DUP_ENTRY') {
      statusCode = 400;
      errorMessage = 'Avaliação duplicada';
    } else if (error.code === 'ER_NO_REFERENCED_ROW') {
      statusCode = 400;
      errorMessage = 'Usuário ou fórum não encontrado';
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });

  } finally {
    if (connection) {
      try {
        await connection.release();
      } catch (releaseError) {
        console.error('Erro ao liberar conexão:', releaseError);
      }
    }
  }
});



// app.get('/foruns_avaliacao/:id_forum', async (req, res) => {
//   try {
//     const [resultado] = await db.promise().query(
//       'SELECT ROUND(AVG(avaliacao),2) AS media_avaliacao FROM av_foruns WHERE id_forum = ?',
//       [req.params.id_forum]
//     );
   
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao calcular a média de avaliações.' });
//   }
// });

app.get('/foruns_avaliacao/:id_forum', async (req, res) => {
  let connection;
  try {
    const id_forum = req.params.id_forum;

    // Validar se o ID do fórum foi fornecido
    if (!id_forum) {
      return res.status(400).json({
        error: 'ID do fórum é obrigatório',
        providedId: id_forum
      });
    }

    // Validar se o ID é um número válido
    if (isNaN(id_forum) || id_forum <= 0) {
      return res.status(400).json({
        error: 'ID do fórum inválido',
        providedId: id_forum
      });
    }

    // Obter conexão do pool
    connection = await db.getConnection();

    // Verificar se o fórum existe
    const [forumExists] = await connection.query(
      'SELECT id_forum FROM forum WHERE id_forum = ?',
      [id_forum]
    );

    if (forumExists.length === 0) {
      return res.status(404).json({
        error: 'Fórum não encontrado',
        forumId: id_forum
      });
    }

    // Chamar a stored procedure para calcular a média
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaForum(?)',
      [id_forum]
    );

    // Log do resultado para debug
    console.log('Resultado do cálculo:', {
      forumId: id_forum,
      resultado: resultado[0][0]
    });

    // Extrair e formatar o resultado
    const mediaPonderada = resultado[0][0]?.media_ponderada ?? 0;
    
    // Retornar o resultado formatado
    res.json({
      forum_id: parseInt(id_forum),
      media_ponderada: parseFloat(mediaPonderada.toFixed(2)),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro ao calcular média ponderada:', error);

    // Tratamento específico de erros
    if (error.code === 'ER_SP_DOES_NOT_EXIST') {
      return res.status(500).json({
        error: 'Stored procedure não encontrada',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        error: 'Tabela não encontrada',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    // Erro genérico
    res.status(500).json({
      error: 'Erro ao calcular a média ponderada de avaliações',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });

  } finally {
    if (connection) {
      try {
        await connection.release();
        console.log('Conexão liberada com sucesso');
      } catch (releaseError) {
        console.error('Erro ao liberar conexão:', releaseError);
      }
    }
  }
});

app.get('/av_foruns', (req, res) => {
  const sql = 'SELECT * FROM av_foruns';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});


// Rota com parâmetro: /av_foruns/1 (onde 1 é o id_forum)
app.get('/av_foruns/:id_forum', (req, res) => {
  const sql = 'SELECT * FROM av_foruns WHERE id_forum = ?';
  db.query(sql, [req.params.id_forum], (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(result);
  });
});

app.delete('/foruns_avaliacao/:id_forum', (req, res) => {
  const id_forum = req.params.id_forum;
  db.query('DELETE FROM av_foruns WHERE id_forum = ?', [id_forum], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});
app.delete('/av_foruns/:id_forum', (req, res) => {
  const id_forum = req.params.id_forum;
  db.query('DELETE FROM av_foruns WHERE id_forum = ?', [id_forum], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});

app.get('/foruns_avaliacao_usuario/:id_forum/:id_usuario', async (req, res) => {
  let connection;
  try {
    // Validar parâmetros
    const { id_forum, id_usuario } = req.params;
    if (!id_forum || !id_usuario) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        details: {
          id_forum: !id_forum ? 'ID do fórum é obrigatório' : null,
          id_usuario: !id_usuario ? 'ID do usuário é obrigatório' : null
        }
      });
    }

    // Obter conexão do pool
    connection = await db.getConnection();

    // Verificar se o fórum existe
    const [forum] = await connection.query(
      'SELECT id_forum FROM foruns WHERE id_forum = ?',
      [id_forum]
    );

    if (forum.length === 0) {
      return res.status(404).json({
        error: 'Fórum não encontrado'
      });
    }

    // Verificar se o usuário existe
    const [usuario] = await connection.query(
      'SELECT id_usuario FROM usuarios WHERE id_usuario = ?',
      [id_usuario]
    );

    if (usuario.length === 0) {
      return res.status(404).json({
        error: 'Usuário não encontrado'
      });
    }

    // Buscar as avaliações individuais do usuário
    const [avaliacoes] = await connection.query(
      `SELECT 
        id_avaliacao,
        av_atendimento,
        av_organizacao,
        av_digital,
        av_infraestrutura,
        av_seguranca,
        data_criacao,
        data_atualizacao
      FROM av_foruns
      WHERE id_forum = ? AND id_usuario = ?
      ORDER BY data_criacao DESC`,
      [id_forum, id_usuario]
    );

    if (avaliacoes.length === 0) {
      return res.json({
        avaliacoes: null,
        message: "Usuário ainda não avaliou este fórum"
      });
    }

    // Configuração dos pesos das avaliações
    const pesos = {
      av_atendimento: 5,
      av_organizacao: 4,
      av_digital: 3,
      av_infraestrutura: 2,
      av_seguranca: 1
    };

    // Calcular a média ponderada das avaliações
    const avaliacoesComMedia = avaliacoes.map(avaliacao => {
      const somaAvaliacoesPonderadas = Object.entries(pesos).reduce((soma, [campo, peso]) => {
        return soma + (avaliacao[campo] * peso);
      }, 0);

      const somaPesos = Object.values(pesos).reduce((a, b) => a + b, 0);
      const mediaPonderada = somaAvaliacoesPonderadas / somaPesos;

      return {
        ...avaliacao,
        media_ponderada: parseFloat(mediaPonderada.toFixed(2)),
        detalhes_calculo: {
          pesos,
          soma_avaliacoes_ponderadas: somaAvaliacoesPonderadas,
          soma_pesos: somaPesos
        }
      };
    });

    // Calcular estatísticas adicionais
    const estatisticas = {
      total_avaliacoes: avaliacoes.length,
      media_geral: parseFloat(
        (avaliacoesComMedia.reduce((sum, av) => sum + av.media_ponderada, 0) / avaliacoes.length)
        .toFixed(2)
      ),
      primeira_avaliacao: new Date(avaliacoes[avaliacoes.length - 1].data_criacao).toISOString(),
      ultima_avaliacao: new Date(avaliacoes[0].data_criacao).toISOString()
    };

    console.log(`Avaliações recuperadas para fórum ${id_forum} e usuário ${id_usuario}`);
    
    res.json({
      avaliacoes: avaliacoesComMedia,
      estatisticas,
      meta: {
        id_forum,
        id_usuario
      }
    });

  } catch (error) {
    console.error('Erro ao buscar avaliações:', error);

    // Tratamento específico de erros
    if (error.code === 'ER_NO_SUCH_TABLE') {
      return res.status(500).json({
        error: 'Erro de estrutura do banco de dados',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({
      error: 'Erro ao buscar avaliações do usuário',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });

  } finally {
    if (connection) {
      try {
        await connection.release();
        console.log('Conexão liberada com sucesso');
      } catch (releaseError) {
        console.error('Erro ao liberar conexão:', releaseError);
      }
    }
  }
});










app.post('/av_tribunais', async (req, res) => {
  let connection;
  try {
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

    // Verificar campos obrigatórios
    const camposObrigatorios = {
      id_usuario,
      id_tribunal,
      numero_protocolo,
      av_eficiencia,
      av_qualidade,
      av_infraestrutura,
      av_tecnologia,
      av_gestao,
      av_transparencia,
      av_sustentabilidade
    };

    const camposFaltantes = Object.entries(camposObrigatorios)
      .filter(([_, value]) => !value)
      .map(([key]) => key);

    if (camposFaltantes.length > 0) {
      return res.status(400).json({ 
        error: "Campos obrigatórios não preenchidos",
        campos: camposFaltantes
      });
    }

    // Validação das avaliações
    const avaliacoes = {
      av_eficiencia,
      av_qualidade,
      av_infraestrutura,
      av_tecnologia,
      av_gestao,
      av_transparencia,
      av_sustentabilidade
    };

    const avaliacoesInvalidas = Object.entries(avaliacoes)
      .filter(([_, valor]) => valor < 1 || valor > 5 || !Number.isInteger(valor))
      .map(([campo]) => campo);

    if (avaliacoesInvalidas.length > 0) {
      return res.status(400).json({ 
        error: "Avaliações inválidas",
        detalhes: "Todas as avaliações devem ser números inteiros entre 1 e 5",
        campos: avaliacoesInvalidas
      });
    }

    // Validação do protocolo
    if (!numero_protocolo || numero_protocolo.length < 5 || numero_protocolo.length > 20) {
      return res.status(400).json({ 
        error: "Número de protocolo inválido",
        detalhes: "O número de protocolo deve ter entre 5 e 20 dígitos"
      });
    }

    // Validação dos horários
    if (horario_chegada && horario_saida) {
      const chegada = new Date(horario_chegada);
      const saida = new Date(horario_saida);

      if (chegada > saida) {
        return res.status(400).json({
          error: "Horários inválidos",
          detalhes: "O horário de chegada deve ser anterior ao horário de saída"
        });
      }
    }

    // Obter conexão do pool
    connection = await db.getConnection();

    // Verificar se usuário existe
    const [usuarios] = await connection.query(
      'SELECT id_usuario FROM usuarios WHERE id_usuario = ?',
      [id_usuario]
    );

    if (usuarios.length === 0) {
      return res.status(404).json({ 
        error: "Usuário não encontrado" 
      });
    }

    // Verificar se tribunal existe
    const [tribunais] = await connection.query(
      'SELECT id_tribunal FROM tribunais WHERE id_tribunal = ?',
      [id_tribunal]
    );

    if (tribunais.length === 0) {
      return res.status(404).json({ 
        error: "Tribunal não encontrado" 
      });
    }

    // Verificar se já existe avaliação do mesmo usuário para o mesmo tribunal com o mesmo protocolo
    const [avaliacoesExistentes] = await connection.query(
      `SELECT id_avaliacao FROM av_tribunais 
       WHERE id_usuario = ? AND id_tribunal = ? AND numero_protocolo = ?`,
      [id_usuario, id_tribunal, numero_protocolo]
    );

    if (avaliacoesExistentes.length > 0) {
      return res.status(409).json({ 
        error: "Avaliação duplicada",
        detalhes: "Já existe uma avaliação deste usuário para este tribunal com este protocolo"
      });
    }

    // Inserir avaliação
    const sql = `
      INSERT INTO av_tribunais (
        id_usuario, id_tribunal, numero_protocolo, comentario,
        av_eficiencia, av_qualidade, av_infraestrutura,
        av_tecnologia, av_gestao, av_transparencia,
        av_sustentabilidade, horario_chegada, horario_saida,
        data_avaliacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;

    const [result] = await connection.query(sql, [
      id_usuario,
      id_tribunal,
      numero_protocolo,
      comentario || null,
      av_eficiencia,
      av_qualidade,
      av_infraestrutura,
      av_tecnologia,
      av_gestao,
      av_transparencia,
      av_sustentabilidade,
      horario_chegada || null,
      horario_saida || null
    ]);

    // Buscar a avaliação inserida
    const [novaAvaliacao] = await connection.query(
      'SELECT * FROM av_tribunais WHERE id_avaliacao = ?',
      [result.insertId]
    );

    // Calcular média das avaliações
    const mediaAvaliacao = Object.values(avaliacoes)
      .reduce((acc, curr) => acc + curr, 0) / Object.keys(avaliacoes).length;

    console.log(`Nova avaliação registrada - ID: ${result.insertId}, Média: ${mediaAvaliacao.toFixed(2)}`);

    res.status(201).json({
      message: "Avaliação registrada com sucesso",
      avaliacao: novaAvaliacao[0],
      media: mediaAvaliacao
    });

  } catch (error) {
    console.error('Erro ao registrar avaliação:', error);

    let statusCode = 500;
    let errorMessage = 'Erro ao registrar avaliação';

    if (error.code === 'ER_DUP_ENTRY') {
      statusCode = 409;
      errorMessage = 'Avaliação duplicada';
    } else if (error.code === 'ER_NO_REFERENCED_ROW') {
      statusCode = 404;
      errorMessage = 'Usuário ou tribunal não encontrado';
    }

    res.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });

  } finally {
    if (connection) {
      try {
        await connection.release();
      } catch (releaseError) {
        console.error('Erro ao liberar conexão:', releaseError);
      }
    }
  }
});

// app.get('/tribunais_avaliacao/:id_tribunal', async (req, res) => {
//   try {
//     const [resultado] = await db.promise().query(
//       'SELECT ROUND(AVG(avaliacao),2) AS media_avaliacao FROM av_tribunais WHERE id_tribunal = ?',
//       [req.params.id_tribunal]
//     );
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao calcular a média de avaliações.' });
//   }
// });

// Endpoint para obter média ponderada de avaliações de um tribunal específico
app.get('/tribunais_avaliacao/:id_tribunal', async (req, res) => {
  let connection;
  try {
    const id_tribunal = req.params.id_tribunal;

    // Validar ID do tribunal
    if (!id_tribunal || isNaN(id_tribunal)) {
      return res.status(400).json({
        error: 'ID do tribunal inválido',
        receivedId: id_tribunal
      });
    }

    // Obter conexão do pool
    connection = await db.getConnection();

    // Chamar a stored procedure
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaTribunal(?)',
      [id_tribunal]
    );

    // Verificar se há resultados
    if (!resultado || !resultado[0] || resultado[0].length === 0) {
      return res.status(404).json({
        error: 'Nenhuma avaliação encontrada para este tribunal',
        tribunalId: id_tribunal
      });
    }

    const mediaPonderada = resultado[0][0]?.media_ponderada || 0;

    // Log do resultado
    console.log(`Média ponderada calculada para tribunal ${id_tribunal}: ${mediaPonderada}`);

    res.json({
      tribunalId: id_tribunal,
      media_ponderada: mediaPonderada,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Erro ao calcular média ponderada:', error);

    // Tratamento específico de erros
    if (error.code === 'ER_SP_DOES_NOT_EXIST') {
      return res.status(500).json({
        error: 'Stored procedure não encontrada',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    res.status(500).json({
      error: 'Erro ao calcular a média ponderada de avaliações',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });

  } finally {
    if (connection) {
      try {
        await connection.release();
      } catch (releaseError) {
        console.error('Erro ao liberar conexão:', releaseError);
      }
    }
  }
});

app.get('/av_tribunais', (req, res) => {
  const sql = 'SELECT * FROM av_tribunais';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});


// Rota com parâmetro: /av_foruns/1 (onde 1 é o id_forum)
// app.get('/av_tribunais/:id_tribunal', (req, res) => {
//   const sql = 'SELECT * FROM av_tribunais WHERE id_tribunal = ?';
//   db.query(sql, [req.params.id_tribunal], (err, result) => {
//     if (err) {
//       res.status(500).json({ error: err.message });
//       return;
//     }
//     res.json(result);
//   });
// });

app.get('/av_tribunais/:id_tribunal', async (req, res) => {
  let connection; // Variável para armazenar a conexão
  try {
    // Obtém a conexão do pool
    connection = await db.promise().getConnection();

    // Executa a query
    const [resultado] = await connection.query(
      'SELECT * FROM av_tribunais WHERE id_tribunal = ?',
      [req.params.id_tribunal]
    );

    res.json(resultado); // Envia a resposta
  } catch (error) {
    console.error('Erro ao buscar dados:', error);
    res.status(500).send('Erro no servidor'); // Envia um erro apropriado
  } finally {
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});


app.delete('/tribunais_avaliacao/:id_tribunal', (req, res) => {
  const id_tribunal = req.params.id_tribunal;
  db.query('DELETE FROM av_tribunais WHERE id_tribunal = ?', [id_tribunal], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});
// app.delete('/av_tribunais/:id_tribunal', (req, res) => {
//   const id_tribunal = req.params.id_tribunal;
//   db.query('DELETE FROM av_tribunais WHERE id_tribunal = ?', [id_tribunal], (err, result) => {
//     if (err) {
//       return res.status(500).send({ error: 'Erro ao deletar avaliações' });
//     }
//     res.send({ message: 'Avaliações deletadas com sucesso' });
//   });
// });

app.delete('/av_tribunais/:id_tribunal', async (req, res) => {
  let connection; // Variável para armazenar a conexão
  try {
    // Obtém a conexão do pool
    connection = await db.promise().getConnection();

    // Executa a query de exclusão
    await connection.query(
      'DELETE FROM av_tribunais WHERE id_tribunal = ?',
      [req.params.id_tribunal]
    );

    res.status(200).json({ message: 'Avaliação deletada com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar avaliações:', error);
    res.status(500).json({ error: 'Erro ao deletar avaliações' });
  } finally {
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});


app.get('/tribunais_avaliacao_usuario/:id_tribunal/:id_usuario', async (req, res) => {
  let connection; // Variável para armazenar a conexão
  try {
    // Obtém a conexão do pool
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
        message: 'Usuário ainda não avaliou este tribunal',
      });
    }

    // Calcular a média para cada avaliação
    const avaliacoesComMedia = avaliacoes.map((avaliacao) => {
      const somaAvaliacoes =
        avaliacao.av_eficiencia * 5 +
        avaliacao.av_qualidade * 4 +
        avaliacao.av_infraestrutura * 3 +
        avaliacao.av_tecnologia * 3 +
        avaliacao.av_gestao * 2 +
        avaliacao.av_transparencia * 2 +
        avaliacao.av_sustentabilidade * 1;

      const somaPesos = 5 + 4 + 3 + 3 + 2 + 2 + 1; // Soma dos pesos
      const media = somaAvaliacoes / somaPesos;

      return {
        ...avaliacao,
        media_ponderada: parseFloat(media.toFixed(2)), // Adiciona a média calculada
      };
    });

    res.json({
      avaliacoes: avaliacoesComMedia,
    });
  } catch (error) {
    console.error('Erro ao buscar avaliações do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    // Libera a conexão se ela foi obtida
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
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao adicionar o comentário e a avaliação.' });
//   }
// });

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
    data_audiencia,
  } = req.body;

  // Validação dos campos de avaliação
  const avaliacoes = [
    av_produtividade,
    av_fundamentacao,
    av_pontualidade,
    av_organizacao,
    av_atendimento,
  ];

  if (avaliacoes.some((av) => av < 1 || av > 5)) {
    return res
      .status(400)
      .json({ error: 'Todas as avaliações devem estar entre 1 e 5.' });
  }

  if (!numero_processo || numero_processo.length < 5 || numero_processo.length > 20) {
    return res
      .status(400)
      .json({ error: 'Número do processo deve ter entre 5 e 20 caracteres.' });
  }

  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
    connection = await db.promise().getConnection();

    // Executa o comando de inserção
    await connection.query(
      `INSERT INTO av_juiz (
        id_usuario, id_juiz, numero_processo, comentario,
        av_produtividade, av_fundamentacao, av_pontualidade,
        av_organizacao, av_atendimento,
        horario_chegada, horario_saida, data_audiencia
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id_usuario,
        id_juiz,
        numero_processo,
        comentario,
        av_produtividade,
        av_fundamentacao,
        av_pontualidade,
        av_organizacao,
        av_atendimento,
        horario_chegada || null,
        horario_saida || null,
        data_audiencia || null,
      ]
    );

    res.status(201).json({ message: 'Avaliação adicionada com sucesso!' });
  } catch (error) {
    console.error('Erro ao adicionar a avaliação do juiz:', error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação do juiz.' });
  } finally {
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});



// app.get('/juiz_avaliacao/:id_juiz', async (req, res) => {
//   try {
//     const [resultado] = await db.promise().query(
//       'SELECT ROUND(AVG(avaliacao),2) AS media_avaliacao FROM av_juiz WHERE id_juiz = ?',
//       [req.params.id_juiz]
//     );
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ error: 'Erro ao calcular a média de avaliações.' });
//   }
// });
// app.get('/av_juiz', (req, res) => {
//   const sql = 'SELECT * FROM av_juiz';
//   db.query(sql, (err, result) => {
//     if (err) throw err;
//     res.send(result);
//   });
// });

app.get('/juiz_avaliacao/:id_juiz', async (req, res) => {
  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
    connection = await db.promise().getConnection();

    // Executa o procedimento armazenado para calcular a média ponderada
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaJuiz(?)',
      [req.params.id_juiz]
    );

    // Retorna a média ponderada ou 0 caso não exista
    res.json({
      media_ponderada: resultado[0][0]?.media_ponderada || 0,
    });
  } catch (error) {
    console.error('Erro ao calcular a média ponderada de avaliações:', error);
    res.status(500).json({ error: 'Erro ao calcular a média ponderada de avaliações.' });
  } finally {
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});

// Rota com parâmetro: /av_foruns/1 (onde 1 é o id_forum)
app.get('/av_juiz/:id_juiz', (req, res) => {
  const sql = 'SELECT * FROM av_juiz WHERE id_juiz = ?';
  db.query(sql, [req.params.id_juiz], (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(result);
  });
});

app.delete('/juiz_avaliacao/:id_juiz', (req, res) => {
  const id_juiz = req.params.id_juiz;
  db.query('DELETE FROM av_juiz WHERE id_juiz = ?', [id_juiz], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});

app.delete('/av_juiz/:id_juiz', (req, res) => {
  const id_juiz = req.params.id_juiz;
  db.query('DELETE FROM av_juiz WHERE id_juiz = ?', [id_juiz], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});

app.get('/juiz_avaliacao_usuario/:id_juiz/:id_usuario', async (req, res) => {
  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
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
    console.error('Erro ao buscar avaliações do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    // Libera a conexão se ela foi obtida
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

  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
    connection = await db.promise().getConnection();

    // Executa o comando de inserção
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

    res.status(201).json({ message: 'Avaliação do mediador adicionada com sucesso!' });
  } catch (error) {
    console.error('Erro ao adicionar a avaliação do mediador:', error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação do mediador.' });
  } finally {
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});

app.get('/mediador_avaliacao/:id_mediador', async (req, res) => {
  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
    connection = await db.promise().getConnection();

    // Executa o procedimento armazenado para calcular a média ponderada do mediador
    const [resultado] = await connection.query(
      'CALL CalcularMediaPonderadaMediador(?)',
      [req.params.id_mediador]
    );

    // Retorna a média ponderada ou 0 caso não exista
    res.json({ 
      media_ponderada: resultado[0][0]?.media_ponderada || 0
    });
  } catch (error) {
    console.error('Erro ao calcular a média ponderada de avaliações:', error);
    res.status(500).json({ error: 'Erro ao calcular a média ponderada de avaliações.' });
  } finally {
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});

app.delete('/mediador_avaliacao/:id_mediador', (req, res) => {
  const id_mediador = req.params.id_mediador;
  db.query('DELETE FROM av_mediador WHERE id_mediador = ?', [id_mediador], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});

app.delete('/av_mediador/:id_mediador', (req, res) => {
  const id_mediador = req.params.id_mediador;
  db.query('DELETE FROM av_mediador WHERE id_mediador = ?', [id_mediador], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});

app.get('/mediador_avaliacao_usuario/:id_mediador/:id_usuario', async (req, res) => {
  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
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
    console.error('Erro ao buscar avaliações do usuário:', error);
    res.status(500).json({ error: 'Erro ao buscar avaliações do usuário.' });
  } finally {
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});

// Rota com parâmetro: /av_foruns/1 (onde 1 é o id_forum)
app.get('/av_mediador/:id_mediador', (req, res) => {
  const sql = 'SELECT * FROM av_mediador WHERE id_mediador = ?';
  db.query(sql, [req.params.id_mediador], (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(result);
  });
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
app.post('/av_advocacia', async (req, res) => {
  let connection; // Variável para gerenciar a conexão
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

  try {
    // Obtém a conexão do pool
    connection = await db.promise().getConnection();

    // Insere a avaliação no banco de dados
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

    res.status(201).json({ message: 'Avaliação adicionada com sucesso!' });
  } catch (error) {
    console.error('Erro ao adicionar a avaliação:', error);
    res.status(500).json({ error: 'Erro ao adicionar a avaliação.' });
  } finally {
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});

app.get('/advocacia_avaliacao/:id_advocacia', async (req, res) => {
  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
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
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});


app.get('/av_advocacia', (req, res) => {
  const sql = 'SELECT * FROM av_advocacia';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});



// Rota com parâmetro: /av_foruns/1 (onde 1 é o id_forum)
app.get('/av_advocacia/:id_advocacia', (req, res) => {
  const sql = 'SELECT * FROM av_advocacia WHERE id_advocacia = ?';
  db.query(sql, [req.params.id_advocacia], (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(result);
  });
});

app.delete('/advocacia_avaliacao/:id_advocacia', (req, res) => {
  const id_advocacia = req.params.id_advocacia;
  db.query('DELETE FROM av_advocacia WHERE id_advocacia = ?', [id_advocacia], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});
app.delete('/av_advocacia/:id_advocacia', (req, res) => {
  const id_advocacia = req.params.id_advocacia;
  db.query('DELETE FROM av_advocacia WHERE id_advocacia = ?', [id_advocacia], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});

app.get('/advocacia_avaliacao_usuario/:id_advocacia/:id_usuario', async (req, res) => {
  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
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
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});


//portal
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

  let connection; // Variável para gerenciar a conexão
  try {
      // Obtém a conexão do pool
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

      res.status(201).json({ message: 'Avaliação adicionada com sucesso!' });

  } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Erro ao adicionar a avaliação.' });
  } finally {
      // Libera a conexão se ela foi obtida
      if (connection) connection.release();
  }
});

app.get('/portal_avaliacao/:id_portal', async (req, res) => {
  let connection; // Variável para gerenciar a conexão
  try {
    // Obtém a conexão do pool
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
    // Libera a conexão se ela foi obtida
    if (connection) connection.release();
  }
});


app.get('/av_portal', (req, res) => {
  const sql = 'SELECT * FROM av_portal';
  db.query(sql, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});


// Rota com parâmetro: /av_foruns/1 (onde 1 é o id_forum)
app.get('/av_portal/:id_portal', (req, res) => {
  const sql = 'SELECT * FROM av_portal WHERE id_portal = ?';
  db.query(sql, [req.params.id_portal], (err, result) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(result);
  });
});

app.delete('/portal_avaliacao/:id_portal', (req, res) => {
  const id_portal = req.params.id_portal;
  db.query('DELETE FROM av_portal WHERE id_portal = ?', [id_portal], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});
app.delete('/av_portal/:id_portal', (req, res) => {
  const id_portal = req.params.id_portal;
  db.query('DELETE FROM av_portal WHERE id_portal = ?', [id_portal], (err, result) => {
    if (err) {
      return res.status(500).send({ error: 'Erro ao deletar avaliações' });
    }
    res.send({ message: 'Avaliações deletadas com sucesso' });
  });
});

app.get('/portal_avaliacao_usuario/:id_portal/:id_usuario', async (req, res) => {
  let connection; // Variável para gerenciar a conexão

  try {
    // Obtém a conexão do pool
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
    // Libera a conexão se ela foi obtida
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
