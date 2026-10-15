/**
 * Entry point server Mini Gantt Project.
 * Jalankan dengan: npm start
 */
'use strict';

const createApp = require('./app');

const PORT = Number(process.env.PORT) || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Mini Gantt Project berjalan di http://localhost:${PORT}`);
});
