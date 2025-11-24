const bodyParser = require('body-parser'); // carrega middleware para interpretar json
const express = require('express'); // carrega o framework express
const path = require('path'); // lida com caminhos de arquivos
const cors = require('cors')

const {
    initialize,
    disconnect,
    query,
    invoke,
} = require('./resources/client.js'); // importa funcoes do cliente hyperledger fabric

function excelSerialToDateString(serial) {
  const excelEpoch = new Date(1899, 11, 30);
  const msPerDay = 86400 * 1000;
  const date = new Date(excelEpoch.getTime() + serial * msPerDay);
  return date.toISOString();
}

function normalizeExcelDates(obj) {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {

    // 🔥 Se é número e parece ser um serial Excel
    if (typeof value === 'number' && value > 25567 && value < 60000) {
      result[key] = excelSerialToDateString(value);
      continue;
    }

    // 🔥 Se o nome indica data/timestamp e está como número
    const lower = key.toLowerCase();
    if (typeof value === 'number' && (lower.includes("date") || lower.includes("timestamp"))) {
      result[key] = excelSerialToDateString(value);
      continue;
    }

    // 🔥 Qualquer campo timestamp *sempre* vira string
    if (lower.includes("timestamp") && typeof value !== 'string') {
      result[key] = String(value);
      continue;
    }

    result[key] = value;
  }
  return result;
}

const app = express()
const port = 3000; // porta do servidor

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json());

// define diretorios estaticos
app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use(express.static(path.join(__dirname, 'views')));

app.get('/teste', (req, res) => {
    res.json({ message: 'Chamada efetuada com sucesso' });
});

app.use(express.static(path.join(__dirname, 'views')));

// ----------------------------- rotas html -----------------------------

// rota principal que envia o arquivo index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.post('/invoke', async (req, res) => {
  let { testID, data } = req.body;
  console.log(testID, data)

  try {
    await initialize();

    const results = [];

    // Se data é UM OBJETO → transforma em array com 1 item
    if (!Array.isArray(data)) {
      data = [data];
    }

    for (let i = 0; i < data.length; i++) {
      const item = data[i];

      // tenta pegar testID do próprio item, igual ao frontend
      let id =
        item.test_id ||
        item.testID ||
        item.TestID ||
        item["TEST ID"] ||
        testID ||
        null;

      // se não existir, alerta
      if (!id) {
        console.warn(`TestID não encontrado no item ${i + 1}`);
      }
      const normalized = normalizeExcelDates(item)

      const jsonString = JSON.stringify(normalized);

      // executa transação
      const result = await invoke(jsonString, id, );

      results.push({
        index: i,
        testID: id,
        status: "ok",
      });
    }

    await disconnect();

    return res.status(200).json({
      message: "Transações executadas com sucesso!",
      total: results.length,
      detalhes: results,
    });

  } catch (error) {
    console.error("Erro no invoke:", error);
    await disconnect();
    return res.status(500).json({ message: "Erro ao executar transações." });
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
