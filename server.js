// server.js
const express = require('express');
const path = require('node:path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`kja_study running at http://localhost:${PORT}`);
});
