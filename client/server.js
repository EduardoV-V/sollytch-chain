const bodyParser = require('body-parser'); // carrega middleware para interpretar json
const express = require('express'); // carrega o framework express
const path = require('path'); // lida com caminhos de arquivos

const {
    initialize,
    disconnect,
    query,
    invoke,
} = require('./resources/client.js'); // importa funcoes do cliente hyperledger fabric

const app = express();
app.use(express.json({ limit: '50mb', type: 'application/json' })); // permite receber json grande
app.use(express.urlencoded({ limit: '50mb', extended: true })) // permite receber dados urlencoded

const port = 3000; // porta do servidor

app.use(bodyParser.json()); // ativa o body parser

// define diretorios estaticos
app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use(express.static(path.join(__dirname, 'views')));
app.use(bodyParser.json());

// ----------------------------- rotas html -----------------------------

// rota principal que envia o arquivo index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// rota para executar uma transacao na rede
app.post('/invoke', async (req, res) => {
  const { testID, data } = req.body; // pega dados do corpo da requisicao
  if (!testID || !data) { // verifica se parametros foram enviados
    return res.status(400).json({ message: 'Parâmetros ausentes.' });
  }

  try {
    await initialize(); // conecta ao fabric
    const jsonString = JSON.stringify(data); // converte dados para string json (necessário pro chaincode)
    await invoke(jsonString, testID); // executa a funcao invoke
    await disconnect(); // encerra conexao
    return res.status(200).json({ message: 'Transação executada com sucesso!' });
  } catch (error) {
    console.error('Erro ao invocar transação:', error); // loga erro
    await disconnect(); // garante desconexao caso caia em erro
    return res.status(500).json({ message: 'Falha ao executar a transação.' });
  }
});

// rota para consultar dados no ledger
app.post('/query', async (req, res) => {
  const { fcn, testID } = req.body; // pega nome da funcao e id do teste
  if (!fcn) { // verifica se funcao foi informada
    return res.status(400).json({ message: 'Função não fornecida.' });
  }

  try {
    await initialize() // conecta ao fabric
    const result = await query(fcn, testID); // executa a consulta
    await disconnect() // encerra conexao
    return res.status(200).json(result); // retorna resultado
  } catch (error) {
    console.error('Erro ao consultar dados:', error); // loga erro
    await disconnect() // garante desconexao caso caia em erro
    return res.status(500).json({ message: 'Erro ao consultar o ledger.' });
  }
});

// inicia o servidor na porta definida
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
