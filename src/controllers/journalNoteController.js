const { query } = require('../config/database');

function formatNote(row) {
  return {
    noteDate: row.note_date instanceof Date
      ? row.note_date.toISOString().split('T')[0]
      : String(row.note_date).split('T')[0],
    content: row.content,
    updatedAt: row.updated_at,
  };
}

// PUT /api/journal-notes/:date — upsert note for a date
exports.upsertNote = async (req, res, next) => {
  try {
    const { date } = req.params;
    const { content } = req.body;

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DATE.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
    }

    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'content must be a string' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ error: 'Note must be 5000 characters or less' });
    }

    // If content is empty, delete the note
    if (content.trim().length === 0) {
      await query(
        'DELETE FROM journal_notes WHERE user_id = $1 AND note_date = $2',
        [req.userId, date]
      );
      return res.json({ noteDate: date, content: '', updatedAt: new Date().toISOString() });
    }

    const result = await query(
      `INSERT INTO journal_notes (user_id, note_date, content)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, note_date) DO UPDATE SET
         content = EXCLUDED.content,
         updated_at = NOW()
       RETURNING *`,
      [req.userId, date, content.trim()]
    );

    res.json(formatNote(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

// GET /api/journal-notes/:date — get note for a specific date
exports.getNoteByDate = async (req, res, next) => {
  try {
    const { date } = req.params;

    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (!ISO_DATE.test(date)) {
      return res.status(400).json({ error: 'Date must be in YYYY-MM-DD format' });
    }

    const result = await query(
      'SELECT * FROM journal_notes WHERE user_id = $1 AND note_date = $2',
      [req.userId, date]
    );

    if (result.rows.length === 0) {
      return res.json({ noteDate: date, content: '', updatedAt: null });
    }

    res.json(formatNote(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

// GET /api/journal-notes?start=YYYY-MM-DD&end=YYYY-MM-DD — get notes in range
exports.getNotes = async (req, res, next) => {
  try {
    const { start, end } = req.query;
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

    if (!start || !end || !ISO_DATE.test(start) || !ISO_DATE.test(end)) {
      return res.status(400).json({ error: 'start and end must be in YYYY-MM-DD format' });
    }

    const result = await query(
      `SELECT * FROM journal_notes
       WHERE user_id = $1 AND note_date >= $2 AND note_date <= $3
       ORDER BY note_date ASC
       LIMIT 31`,
      [req.userId, start, end]
    );

    res.json(result.rows.map(formatNote));
  } catch (err) {
    next(err);
  }
};
