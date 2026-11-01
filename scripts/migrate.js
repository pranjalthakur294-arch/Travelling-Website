const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'traveluser',
  password: '1234',
  database: 'travel_db'
});

db.connect(err => {
  if (err) {
    console.error('Migration connection error:', err);
    process.exit(1);
  }

  const createSessions = `
    CREATE TABLE IF NOT EXISTS sessions (
      id VARCHAR(128) PRIMARY KEY,
      session_data TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  db.query(createSessions, (err) => {
    if (err) {
      console.error('Error creating sessions table:', err);
    } else {
      console.log('Table "sessions" ensured ✅');
    }
  });

  const createDestinations = `
    CREATE TABLE IF NOT EXISTS destinations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      country VARCHAR(100) NOT NULL,
      city VARCHAR(100) NOT NULL,
      image VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

  db.query(createDestinations, (err) => {
    if (err) {
      console.error('Error creating destinations table:', err);
      db.end();
      return;
    }
    console.log('Table "destinations" ensured ✅');

    // Check if destinations table is empty
    db.query('SELECT COUNT(*) AS count FROM destinations', (err, rows) => {
      if (!err && rows[0].count === 0) {
        const seedSql = `
          INSERT INTO destinations (country, city, image) VALUES
          ('India', 'New Delhi & Jaipur', 'images/tajmahal.jpg'),
          ('Spain', 'Madrid & Barcelona', 'images/spain.jpg'),
          ('Italy', 'Rome & Florence', 'images/flo.png'),
          ('Japan', 'Tokyo & Kyoto', 'images/cherry.jpg'),
          ('Mexico', 'Mexico City & Oaxaca', 'images/Mexico.jpg'),
          ('Switzerland', 'Lucerne & Alps', 'images/Switzerland.jpg')
        `;
        db.query(seedSql, (err) => {
          if (err) console.error('Seed error:', err);
          else console.log('Destinations table seeded with featured countries ✅');
          db.end();
        });
      } else {
        console.log('Destinations table already has data or query skipped.');
        db.end();
      }
    });
  });
});
