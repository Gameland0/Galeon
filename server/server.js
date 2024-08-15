const app = require('./src/app');
const dbs = require('./src/models');

const PORT = process.env.PORT || 3000;

dbs.getConnection()
  .then(() => {
    console.log('Database connected successfully');
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err);
  });
