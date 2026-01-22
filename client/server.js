const bodyParser = require('body-parser');
const express = require('express');
const path = require('path');
const cors = require('cors');
const fsRead = require('fs');
const multer = require('multer');
const crypto = require('crypto')

const upload = multer({ dest: 'uploads/' });

const {
  withFabric,
  storeTest,
  storeModel,
  queryTest,
  updateTest,
  storeImage,
  queryImage
} = require('./resources/standalone_client.js');

const app = express();
const port = 3000;

// middleware

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json());

app.use('/resources', express.static(path.join(__dirname, 'resources')));
app.use(express.static(path.join(__dirname, 'views')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

//endpoints de store

app.post('/store/test', async (req, res) => {
  let { testID, data } = req.body;

  try {
    if (!Array.isArray(data)) data = [data];

    const results = [];

    await withFabric(async () => {
      for (let i = 0; i < data.length; i++) {
        const item = data[i];

        const id =
          item.test_id ||
          item.testID ||
          item.TestID ||
          testID;

        if (!id) {
          throw new Error(`TestID ausente no item ${i}`);
        }

        item.test_id = id;
        await storeTest(JSON.stringify(item));

        results.push({ index: i, testID: id, status: "ok" });
      }
    });

    res.json({
      message: "Testes armazenados com sucesso",
      total: results.length,
      detalhes: results
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post(
  '/store/image',
  upload.single('image'),
  async (req, res) => {
    const { imageID } = req.body;
    const filePath = req.file.path;

    try {
      const buffer = fsRead.readFileSync(filePath);
      const hash = crypto
        .createHash("sha512")
        .update(buffer)
        .digest("hex");

      await withFabric(() =>
        storeImage(hash, imageID)
      );

      res.json({
        message: "Imagem armazenada com sucesso",
        imageID
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  '/store/model',
  upload.single('model'),
  async (req, res) => {
    const { modelKey } = req.body;
    const buffer = fsRead.readFileSync(req.file.path);
    const base64 = buffer.toString('base64');

    try {
      await withFabric(() =>
        storeModel(base64, modelKey)
      );

      res.json({
        message: "Modelo armazenado com sucesso",
        modelKey
      });

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

//endpoints query

app.post('/query/test', async (req, res) => {
  const { testID } = req.body;

  if (!testID) {
    return res.status(400).json({ error: "testID é obrigatório" });
  }

  try {
    const result = await withFabric(() =>
      queryTest(testID)
    );

    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/query/image', async (req, res) => {
  const { imageID } = req.body;

  if (!imageID) {
    return res.status(400).json({ error: "imageID é obrigatório" });
  }

  try {
    const hash = await withFabric(() =>
      queryImage(imageID)
    );

    res.json({
      imageID,
      hash
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// endpoint update

app.put('/update/test', async (req, res) => {
  const { testID, data } = req.body;

  if (!testID || !data) {
    return res.status(400).json({
      error: "testID e data são obrigatórios"
    });
  }

  try {
    await withFabric(() =>
      updateTest(JSON.stringify(data), testID)
    );

    res.json({
      message: "Teste atualizado com sucesso",
      testID
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
