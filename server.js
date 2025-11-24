const express = require('express');
const cors = require('cors');
const routes = require('./src/routes');

const app = express();
app.use(express.json());
app.use(cors());
app.use(routes);

const port = process.env.PORT || 3000;


app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});