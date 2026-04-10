'use strict';

const express    = require('express');
const bodyParser = require('body-parser');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');
const multer     = require('multer');
const jwt        = require('jsonwebtoken');

const upload = multer({ dest: 'uploads/' });

// Modulos da rede Fabric
const register = require('./resources/register.js');
const { generateChallenge, verifySignature, activeChallenges } = require('./resources/verify.js');
const normalizeS = require('./resources/normalization.js');
const {
  initialize,
  createProposal,
  createTransaction,
  createCommit,
  finalize,
  close
} = require('./resources/invoke.js');

const app  = express();
const PORT = 3000;

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json());

app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use(express.static(path.join(__dirname, 'views')));

// ---------------------------------------------------------------------------
// JWT
// ---------------------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET || 'sollytch-dev-secret';

// Valida o token Bearer e injeta req.user
function authRequired(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return res.status(401).json({ error: 'Token ausente' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido ou expirado' });
  }
}

// ---------------------------------------------------------------------------
// Sessoes de transacao em andamento
// Mapeia txId -> { createdAt }
// O estado de bytes (proposalBytes, transactionBytes, etc.) fica em invoke.js
// ---------------------------------------------------------------------------

const txSessions = new Map();

// Expira sessoes com mais de 10 minutos
setInterval(() => {
  const limite = Date.now() - 10 * 60 * 1000;
  for (const [id, session] of txSessions) {
    if (session.createdAt < limite) txSessions.delete(id);
  }
}, 60 * 1000);

// ---------------------------------------------------------------------------
// Paginas
// ---------------------------------------------------------------------------

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'register.html'));
});

// ---------------------------------------------------------------------------
// AUTENTICACAO
// ---------------------------------------------------------------------------

// Registra usuario na wallet Fabric via CSR
// Espera: { username: string, csr: string (PEM) }
app.post('/auth/register', async (req, res) => {
  const { username, csr } = req.body;

  if (!username || !csr) {
    return res.status(400).json({ error: 'username e csr sao obrigatorios' });
  }

  try {
    await register(username, csr);
    res.json({ message: `Usuario ${username} registrado com sucesso` });
  } catch (err) {
    console.error('Erro no registro:', err);
    res.status(500).json({ error: err.message });
  }
});

// Passo 1 do login: gera nonce e devolve ao frontend para assinar
// Espera: { username: string }
app.post('/auth/challenge', (req, res) => {
  const { username } = req.body;

  if (!username) return res.status(400).json({ error: 'username e obrigatorio' });

  const challenge = generateChallenge();
  activeChallenges.set(username, challenge);

  res.json({ nonce: challenge.nonce });
});

// Passo 2 do login: verifica assinatura do nonce e emite JWT
// Espera: { username: string, signature: number[] (bytes da assinatura DER) }
app.post('/auth/login', async (req, res) => {
  const { username, signature } = req.body;

  if (!username || !signature) {
    return res.status(400).json({ error: 'username e signature sao obrigatorios' });
  }

  try {
    const sigBuffer = Buffer.from(signature);
    const { token } = await verifySignature(username, sigBuffer);
    res.json({ token });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(401).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// TRANSACOES COM ASSINATURA OFFLINE
//
// Fluxo ping-pong via endpoint unico. Cada requisicao avanca um passo:
//
//   Frontend                          Backend
//   --------                          -------
//   { action:'init', chaincode, fcn, args }
//                                  -> inicializa gateway, cria proposta
//   <- { txId, step:'proposal', proposalDigest }
//
//   { txId, step:'proposal', signature }
//                                  -> normaliza sig, cria transacao
//   <- { txId, step:'transaction', transactionDigest }
//
//   { txId, step:'transaction', signature }
//                                  -> normaliza sig, cria commit
//   <- { txId, step:'commit', commitDigest }
//
//   { txId, step:'commit', signature }
//                                  -> normaliza sig, finaliza
//   <- { txId, step:'done', ok:true, result }
//
// A normalizacao converte a assinatura RAW 64 bytes (R||S) gerada pelo
// Web Crypto API para DER canonico (S normalizado) exigido pelo Fabric Gateway.
//
// /invoke e /query sao aliases de /transaction mantidos para compatibilidade
// com o frontend de referencia (chaincode.html).
// ---------------------------------------------------------------------------

async function handleTransaction(req, res) {
  const { action, step, txId, chaincode, fcn, args, signature } = req.body;
  const username = req.user.sub;

  try {

    // --- INIT: recebe parametros do chaincode e cria a proposta ---
    if (action === 'init') {
      if (!chaincode || !fcn || !args) {
        return res.status(400).json({ error: 'chaincode, fcn e args sao obrigatorios' });
      }

      initialize(username, chaincode);

      const proposalDigest = await createProposal(fcn, ...args);
      const newTxId = crypto.randomUUID();
      txSessions.set(newTxId, { createdAt: Date.now() });

      return res.json({
        txId:           newTxId,
        step:           'proposal',
        proposalDigest: proposalDigest.toString('base64')
      });
    }

    // --- PASSOS SUBSEQUENTES: requerem txId, step e signature ---
    if (!txId || !step || !signature) {
      return res.status(400).json({ error: 'txId, step e signature sao obrigatorios' });
    }

    if (!txSessions.has(txId)) {
      return res.status(400).json({ error: 'Sessao nao encontrada ou expirada' });
    }

    // Normaliza assinatura RAW 64 bytes (R||S) para DER canonico
    const sigDER = normalizeS(Buffer.from(signature));

    // --- PROPOSAL: cria transacao a partir da proposta assinada ---
    if (step === 'proposal') {
      const transactionDigest = await createTransaction(sigDER);

      return res.json({
        txId,
        step:              'transaction',
        transactionDigest: transactionDigest.toString('base64')
      });
    }

    // --- TRANSACTION: cria commit a partir da transacao assinada ---
    if (step === 'transaction') {
      const commitDigest = await createCommit(sigDER);

      return res.json({
        txId,
        step:         'commit',
        commitDigest: commitDigest.toString('base64')
      });
    }

    // --- COMMIT: finaliza submetendo o commit assinado ---
    if (step === 'commit') {
      const result = await finalize(sigDER);

      txSessions.delete(txId);
      close();

      return res.json({
        txId,
        step:   'done',
        ok:     true,
        result: result ?? null
      });
    }

    return res.status(400).json({ error: `Step desconhecido: ${step}` });

  } catch (err) {
    console.error('Erro na transacao:', err);
    txSessions.delete(txId);
    try { close(); } catch {}
    res.status(500).json({ error: err.message });
  }
}

// Rota principal de transacao
app.post('/transaction', authRequired, handleTransaction);

// Aliases mantidos para compatibilidade com o frontend de referencia
app.post('/invoke', authRequired, handleTransaction);
app.post('/query',  authRequired, handleTransaction);

// ---------------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------------

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Inicializacao
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});