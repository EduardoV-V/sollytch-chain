const express = require('express');
const app = express();
const port = 3000;

app.use((req, res, next) => {
  console.log('Req:', req.method, req.url);
  next();
});

app.get('/login', (req, res) => {
  console.log('ROTA /login');
  res.send('<h1>Login Page</h1>');
});

app.listen(port, () => console.log(`Rodando em http://localhost:${port}`));