const bodyParser = require('body-parser'); // Middleware para parse de JSON no corpo das requisições
const express = require('express'); // Framework web para Node.js
const path = require('path'); // Utilitário para lidar com caminhos de arquivos
const fs = require('fs'); // File system para ler/escrever arquivos

const {
    initialize,
    disconnect,
    query,
    invoke,
} = require('./resources/client.js');

const app = express();
app.use(express.json({ limit: '50mb', type: 'application/json' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }))

const port = 3000;

app.use(bodyParser.json());

app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use(express.static(path.join(__dirname, 'views')));
app.use(bodyParser.json());

// ----------------------------- ROTAS HTML -----------------------------

// Página inicial
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/invoke', async (req, res) => {
  const { testID, data } = req.body;
  if (!testID || !data) {
    return res.status(400).json({ message: 'Parâmetros ausentes.' });
  }

  try {
    await initialize();
    const jsonString = JSON.stringify(data);
    await invoke(jsonString, testID);
    await disconnect();
    return res.status(200).json({ message: 'Transação executada com sucesso!' });
  } catch (error) {
    console.error('Erro ao invocar transação:', error);
    await disconnect();
    return res.status(500).json({ message: 'Falha ao executar a transação.' });
  }
});

app.post('/query', async (req, res) => {
  const { fcn, testID } = req.body;
  if (!fcn) {
    return res.status(400).json({ message: 'Função não fornecida.' });
  }

  try {
    await initialize()
    const result = await query(fcn, testID);
    await disconnect()
    return res.status(200).json(result);
  } catch (error) {
    console.error('Erro ao consultar dados:', error);
    await disconnect()
    return res.status(500).json({ message: 'Erro ao consultar o ledger.' });
  }
});

app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});