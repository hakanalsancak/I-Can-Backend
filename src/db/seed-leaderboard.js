require('dotenv').config();
const { pool } = require('../config/database');

const fakeAthletes = [
  // Top global athletes with massive streaks
  { name: 'Marcus Johnson', country: 'US', sport: 'basketball', streak: 247, longest: 247 },
  { name: 'Yuki Tanaka', country: 'JP', sport: 'tennis', streak: 213, longest: 213 },
  { name: 'Carlos Mendes', country: 'BR', sport: 'soccer', streak: 198, longest: 210 },
  { name: 'Amara Diallo', country: 'FR', sport: 'boxing', streak: 185, longest: 185 },
  { name: 'Liam O\'Brien', country: 'IE', sport: 'soccer', streak: 174, longest: 174 },
  { name: 'Priya Sharma', country: 'IN', sport: 'cricket', streak: 162, longest: 180 },
  { name: 'Erik Johansson', country: 'SE', sport: 'soccer', streak: 155, longest: 155 },
  { name: 'Fatima Al-Rashid', country: 'AE', sport: 'tennis', streak: 148, longest: 148 },
  { name: 'Jake Williams', country: 'AU', sport: 'cricket', streak: 141, longest: 160 },
  { name: 'Sofia Martinez', country: 'ES', sport: 'soccer', streak: 137, longest: 137 },
  { name: 'Leon Müller', country: 'DE', sport: 'soccer', streak: 129, longest: 145 },
  { name: 'Chiara Rossi', country: 'IT', sport: 'tennis', streak: 122, longest: 122 },
  { name: 'Noah van Dijk', country: 'NL', sport: 'soccer', streak: 118, longest: 118 },
  { name: 'David Kim', country: 'KR', sport: 'boxing', streak: 112, longest: 130 },
  { name: 'Omar Hassan', country: 'EG', sport: 'soccer', streak: 108, longest: 108 },
  { name: 'Tyler Brooks', country: 'US', sport: 'football', streak: 103, longest: 103 },
  { name: 'Aisha Okonkwo', country: 'NG', sport: 'basketball', streak: 99, longest: 110 },
  { name: 'Mateo Garcia', country: 'AR', sport: 'soccer', streak: 94, longest: 94 },
  { name: 'Mia Chen', country: 'CA', sport: 'tennis', streak: 91, longest: 105 },
  { name: 'Kofi Mensah', country: 'GH', sport: 'soccer', streak: 88, longest: 88 },

  // UK athletes
  { name: 'James Wilson', country: 'GB', sport: 'soccer', streak: 167, longest: 167 },
  { name: 'Charlotte Davies', country: 'GB', sport: 'boxing', streak: 143, longest: 155 },
  { name: 'Oliver Thompson', country: 'GB', sport: 'tennis', streak: 126, longest: 126 },
  { name: 'Ella Hughes', country: 'GB', sport: 'cricket', streak: 109, longest: 120 },
  { name: 'George Patel', country: 'GB', sport: 'soccer', streak: 97, longest: 97 },
  { name: 'Sophie Brown', country: 'GB', sport: 'basketball', streak: 85, longest: 92 },
  { name: 'Harry Mitchell', country: 'GB', sport: 'boxing', streak: 78, longest: 90 },
  { name: 'Amelia Scott', country: 'GB', sport: 'tennis', streak: 72, longest: 72 },
  { name: 'Jack Robinson', country: 'GB', sport: 'soccer', streak: 65, longest: 80 },
  { name: 'Isla Morris', country: 'GB', sport: 'cricket', streak: 58, longest: 58 },
  { name: 'Thomas Wright', country: 'GB', sport: 'football', streak: 52, longest: 60 },
  { name: 'Grace Taylor', country: 'GB', sport: 'soccer', streak: 45, longest: 55 },
  { name: 'Daniel Clark', country: 'GB', sport: 'boxing', streak: 39, longest: 50 },
  { name: 'Emily Walker', country: 'GB', sport: 'basketball', streak: 33, longest: 33 },
  { name: 'Ryan Lewis', country: 'GB', sport: 'soccer', streak: 27, longest: 40 },

  // US athletes
  { name: 'Jordan Davis', country: 'US', sport: 'basketball', streak: 156, longest: 170 },
  { name: 'Kayla Washington', country: 'US', sport: 'tennis', streak: 139, longest: 139 },
  { name: 'Ethan Moore', country: 'US', sport: 'football', streak: 124, longest: 135 },
  { name: 'Brianna James', country: 'US', sport: 'soccer', streak: 115, longest: 115 },
  { name: 'Dylan Cooper', country: 'US', sport: 'boxing', streak: 98, longest: 110 },
  { name: 'Taylor Reed', country: 'US', sport: 'basketball', streak: 89, longest: 89 },
  { name: 'Austin Hill', country: 'US', sport: 'football', streak: 76, longest: 82 },
  { name: 'Chloe Bennett', country: 'US', sport: 'tennis', streak: 68, longest: 75 },
  { name: 'Mason Rivera', country: 'US', sport: 'soccer', streak: 61, longest: 65 },
  { name: 'Hannah Price', country: 'US', sport: 'boxing', streak: 55, longest: 55 },
  { name: 'Logan Murphy', country: 'US', sport: 'basketball', streak: 48, longest: 60 },
  { name: 'Zoe Torres', country: 'US', sport: 'soccer', streak: 42, longest: 42 },
  { name: 'Brandon Kelly', country: 'US', sport: 'football', streak: 36, longest: 45 },

  // Turkey athletes
  { name: 'Emre Yılmaz', country: 'TR', sport: 'soccer', streak: 172, longest: 172 },
  { name: 'Elif Kaya', country: 'TR', sport: 'boxing', streak: 134, longest: 145 },
  { name: 'Burak Demir', country: 'TR', sport: 'basketball', streak: 119, longest: 119 },
  { name: 'Zeynep Çelik', country: 'TR', sport: 'tennis', streak: 101, longest: 115 },
  { name: 'Arda Şahin', country: 'TR', sport: 'soccer', streak: 87, longest: 87 },
  { name: 'Defne Arslan', country: 'TR', sport: 'boxing', streak: 74, longest: 80 },
  { name: 'Kaan Öztürk', country: 'TR', sport: 'soccer', streak: 63, longest: 70 },
  { name: 'Selin Koç', country: 'TR', sport: 'basketball', streak: 56, longest: 56 },
  { name: 'Mert Aydın', country: 'TR', sport: 'soccer', streak: 49, longest: 55 },
  { name: 'Ayşe Polat', country: 'TR', sport: 'tennis', streak: 41, longest: 41 },
  { name: 'Yusuf Erdoğan', country: 'TR', sport: 'boxing', streak: 35, longest: 45 },
  { name: 'İrem Güneş', country: 'TR', sport: 'soccer', streak: 28, longest: 35 },
  { name: 'Can Aksoy', country: 'TR', sport: 'basketball', streak: 22, longest: 30 },
  { name: 'Nisa Korkmaz', country: 'TR', sport: 'soccer', streak: 18, longest: 25 },
  { name: 'Barış Yıldız', country: 'TR', sport: 'tennis', streak: 14, longest: 14 },

  // Germany athletes
  { name: 'Lukas Schmidt', country: 'DE', sport: 'soccer', streak: 151, longest: 165 },
  { name: 'Anna Weber', country: 'DE', sport: 'tennis', streak: 117, longest: 117 },
  { name: 'Finn Becker', country: 'DE', sport: 'boxing', streak: 96, longest: 100 },
  { name: 'Lena Fischer', country: 'DE', sport: 'soccer', streak: 82, longest: 95 },
  { name: 'Paul Hoffmann', country: 'DE', sport: 'basketball', streak: 71, longest: 71 },
  { name: 'Marie Koch', country: 'DE', sport: 'tennis', streak: 64, longest: 70 },
  { name: 'Felix Wolf', country: 'DE', sport: 'soccer', streak: 57, longest: 65 },
  { name: 'Clara Braun', country: 'DE', sport: 'boxing', streak: 50, longest: 50 },
  { name: 'Maximilian Krause', country: 'DE', sport: 'soccer', streak: 43, longest: 48 },
  { name: 'Jana Richter', country: 'DE', sport: 'basketball', streak: 37, longest: 42 },
  { name: 'Tim Wagner', country: 'DE', sport: 'tennis', streak: 31, longest: 38 },
  { name: 'Laura Schulz', country: 'DE', sport: 'soccer', streak: 25, longest: 30 },
  { name: 'Niklas Hartmann', country: 'DE', sport: 'boxing', streak: 20, longest: 24 },
  { name: 'Mia Zimmermann', country: 'DE', sport: 'soccer', streak: 15, longest: 18 },
  { name: 'Jannik Bauer', country: 'DE', sport: 'basketball', streak: 11, longest: 15 },

  // Brazil athletes
  { name: 'Lucas Silva', country: 'BR', sport: 'soccer', streak: 189, longest: 200 },
  { name: 'Beatriz Santos', country: 'BR', sport: 'boxing', streak: 145, longest: 145 },
  { name: 'Rafael Oliveira', country: 'BR', sport: 'soccer', streak: 121, longest: 130 },
  { name: 'Camila Costa', country: 'BR', sport: 'tennis', streak: 106, longest: 106 },
  { name: 'Gabriel Ferreira', country: 'BR', sport: 'basketball', streak: 92, longest: 100 },
  { name: 'Isabela Lima', country: 'BR', sport: 'soccer', streak: 81, longest: 88 },
  { name: 'Thiago Souza', country: 'BR', sport: 'boxing', streak: 73, longest: 73 },
  { name: 'Larissa Almeida', country: 'BR', sport: 'soccer', streak: 66, longest: 72 },
  { name: 'Pedro Rocha', country: 'BR', sport: 'basketball', streak: 59, longest: 62 },
  { name: 'Ana Ribeiro', country: 'BR', sport: 'tennis', streak: 53, longest: 58 },
  { name: 'Vinícius Barbosa', country: 'BR', sport: 'soccer', streak: 47, longest: 50 },
  { name: 'Juliana Cardoso', country: 'BR', sport: 'boxing', streak: 40, longest: 45 },
  { name: 'Henrique Araújo', country: 'BR', sport: 'soccer', streak: 34, longest: 38 },
  { name: 'Marina Nunes', country: 'BR', sport: 'basketball', streak: 29, longest: 32 },
  { name: 'Gustavo Teixeira', country: 'BR', sport: 'soccer', streak: 23, longest: 28 },

  // India athletes
  { name: 'Arjun Patel', country: 'IN', sport: 'cricket', streak: 178, longest: 190 },
  { name: 'Ananya Singh', country: 'IN', sport: 'tennis', streak: 144, longest: 150 },
  { name: 'Rohan Gupta', country: 'IN', sport: 'cricket', streak: 127, longest: 127 },
  { name: 'Meera Reddy', country: 'IN', sport: 'boxing', streak: 113, longest: 120 },
  { name: 'Vikram Sharma', country: 'IN', sport: 'soccer', streak: 99, longest: 99 },
  { name: 'Riya Joshi', country: 'IN', sport: 'basketball', streak: 86, longest: 93 },
  { name: 'Aditya Kumar', country: 'IN', sport: 'cricket', streak: 77, longest: 85 },
  { name: 'Kavya Iyer', country: 'IN', sport: 'tennis', streak: 69, longest: 69 },
  { name: 'Siddharth Nair', country: 'IN', sport: 'boxing', streak: 60, longest: 66 },
  { name: 'Divya Menon', country: 'IN', sport: 'cricket', streak: 54, longest: 58 },
  { name: 'Rahul Verma', country: 'IN', sport: 'soccer', streak: 46, longest: 52 },
  { name: 'Ishita Das', country: 'IN', sport: 'basketball', streak: 38, longest: 42 },
  { name: 'Karthik Bhat', country: 'IN', sport: 'cricket', streak: 32, longest: 36 },
  { name: 'Neha Agarwal', country: 'IN', sport: 'tennis', streak: 26, longest: 30 },
  { name: 'Aryan Mishra', country: 'IN', sport: 'soccer', streak: 19, longest: 22 },

  // Japan athletes
  { name: 'Haruto Suzuki', country: 'JP', sport: 'boxing', streak: 169, longest: 175 },
  { name: 'Sakura Yamamoto', country: 'JP', sport: 'tennis', streak: 138, longest: 138 },
  { name: 'Ren Takahashi', country: 'JP', sport: 'soccer', streak: 116, longest: 125 },
  { name: 'Hina Watanabe', country: 'JP', sport: 'basketball', streak: 102, longest: 102 },
  { name: 'Souta Nakamura', country: 'JP', sport: 'boxing', streak: 90, longest: 96 },
  { name: 'Aoi Kobayashi', country: 'JP', sport: 'tennis', streak: 79, longest: 85 },
  { name: 'Kaito Itō', country: 'JP', sport: 'soccer', streak: 70, longest: 74 },
  { name: 'Yuna Saitō', country: 'JP', sport: 'basketball', streak: 62, longest: 62 },
  { name: 'Riku Kimura', country: 'JP', sport: 'boxing', streak: 55, longest: 60 },
  { name: 'Mei Hayashi', country: 'JP', sport: 'soccer', streak: 48, longest: 52 },
  { name: 'Takumi Mori', country: 'JP', sport: 'tennis', streak: 41, longest: 46 },
  { name: 'Himari Abe', country: 'JP', sport: 'basketball', streak: 35, longest: 38 },
  { name: 'Yuto Shimizu', country: 'JP', sport: 'boxing', streak: 29, longest: 32 },
  { name: 'Riko Hashimoto', country: 'JP', sport: 'soccer', streak: 22, longest: 25 },
  { name: 'Sora Ogawa', country: 'JP', sport: 'tennis', streak: 16, longest: 20 },

  // Australia athletes
  { name: 'Lachlan Smith', country: 'AU', sport: 'cricket', streak: 158, longest: 165 },
  { name: 'Olivia Jones', country: 'AU', sport: 'tennis', streak: 131, longest: 140 },
  { name: 'Cooper Anderson', country: 'AU', sport: 'soccer', streak: 114, longest: 114 },
  { name: 'Matilda Brown', country: 'AU', sport: 'basketball', streak: 100, longest: 108 },
  { name: 'Archer Taylor', country: 'AU', sport: 'boxing', streak: 88, longest: 88 },
  { name: 'Zara Martin', country: 'AU', sport: 'cricket', streak: 76, longest: 82 },
  { name: 'Hugo Wilson', country: 'AU', sport: 'soccer', streak: 67, longest: 71 },
  { name: 'Willow Thomas', country: 'AU', sport: 'tennis', streak: 60, longest: 64 },
  { name: 'Flynn White', country: 'AU', sport: 'basketball', streak: 53, longest: 57 },
  { name: 'Sienna Harris', country: 'AU', sport: 'cricket', streak: 46, longest: 50 },
  { name: 'Charlie Clark', country: 'AU', sport: 'boxing', streak: 39, longest: 43 },
  { name: 'Harper Lewis', country: 'AU', sport: 'soccer', streak: 33, longest: 36 },
  { name: 'Kai Robinson', country: 'AU', sport: 'tennis', streak: 27, longest: 30 },
  { name: 'Ruby Walker', country: 'AU', sport: 'cricket', streak: 21, longest: 24 },
  { name: 'Finn Hall', country: 'AU', sport: 'basketball', streak: 15, longest: 18 },

  // Spain athletes
  { name: 'Pablo Hernández', country: 'ES', sport: 'soccer', streak: 163, longest: 175 },
  { name: 'Lucía Fernández', country: 'ES', sport: 'tennis', streak: 133, longest: 133 },
  { name: 'Álvaro López', country: 'ES', sport: 'basketball', streak: 111, longest: 120 },
  { name: 'Carmen Ruiz', country: 'ES', sport: 'boxing', streak: 95, longest: 100 },
  { name: 'Diego Moreno', country: 'ES', sport: 'soccer', streak: 83, longest: 83 },
  { name: 'Elena Navarro', country: 'ES', sport: 'tennis', streak: 74, longest: 78 },
  { name: 'Javier Romero', country: 'ES', sport: 'soccer', streak: 66, longest: 70 },
  { name: 'Sara Jiménez', country: 'ES', sport: 'basketball', streak: 58, longest: 62 },
  { name: 'Adrián Díaz', country: 'ES', sport: 'boxing', streak: 51, longest: 55 },
  { name: 'María Torres', country: 'ES', sport: 'soccer', streak: 44, longest: 48 },
  { name: 'Hugo Ramírez', country: 'ES', sport: 'tennis', streak: 38, longest: 42 },
  { name: 'Paula Vega', country: 'ES', sport: 'soccer', streak: 32, longest: 35 },
  { name: 'Daniel Castro', country: 'ES', sport: 'basketball', streak: 26, longest: 28 },
  { name: 'Ines Molina', country: 'ES', sport: 'boxing', streak: 20, longest: 22 },
  { name: 'Marcos Ortega', country: 'ES', sport: 'soccer', streak: 13, longest: 16 },

  // France athletes
  { name: 'Hugo Dubois', country: 'FR', sport: 'soccer', streak: 159, longest: 170 },
  { name: 'Camille Laurent', country: 'FR', sport: 'tennis', streak: 136, longest: 136 },
  { name: 'Antoine Bernard', country: 'FR', sport: 'boxing', streak: 120, longest: 128 },
  { name: 'Léa Moreau', country: 'FR', sport: 'basketball', streak: 105, longest: 112 },
  { name: 'Théo Petit', country: 'FR', sport: 'soccer', streak: 93, longest: 93 },
  { name: 'Chloé Robert', country: 'FR', sport: 'tennis', streak: 80, longest: 86 },
  { name: 'Maxime Roux', country: 'FR', sport: 'boxing', streak: 71, longest: 75 },
  { name: 'Emma Fournier', country: 'FR', sport: 'soccer', streak: 63, longest: 67 },
  { name: 'Julien Girard', country: 'FR', sport: 'basketball', streak: 56, longest: 60 },
  { name: 'Manon Leroy', country: 'FR', sport: 'tennis', streak: 49, longest: 52 },
  { name: 'Lucas Garnier', country: 'FR', sport: 'soccer', streak: 42, longest: 46 },
  { name: 'Inès Morel', country: 'FR', sport: 'boxing', streak: 36, longest: 40 },
  { name: 'Raphaël Simon', country: 'FR', sport: 'basketball', streak: 30, longest: 33 },
  { name: 'Jade Lefèvre', country: 'FR', sport: 'soccer', streak: 24, longest: 27 },
  { name: 'Bastien Martin', country: 'FR', sport: 'tennis', streak: 17, longest: 20 },
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const athlete of fakeAthletes) {
      const email = `fake_${athlete.name.toLowerCase().replace(/[^a-z]/g, '_')}@ican.seed`;

      const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) continue;

      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, full_name, country, sport, onboarding_completed)
         VALUES ($1, 'SEED_NO_LOGIN', $2, $3, $4, TRUE) RETURNING id`,
        [email, athlete.name, athlete.country, athlete.sport]
      );

      const userId = userResult.rows[0].id;

      await client.query(
        `INSERT INTO streaks (user_id, current_streak, longest_streak, last_entry_date, updated_at)
         VALUES ($1, $2, $3, CURRENT_DATE, NOW() - interval '1 second' * $4)
         ON CONFLICT (user_id) DO UPDATE SET current_streak = $2, longest_streak = $3`,
        [userId, athlete.streak, athlete.longest, athlete.streak]
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${fakeAthletes.length} fake athletes`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
