const { query } = require('../config/database');

function formatGoal(g) {
  return {
    id: g.id,
    goalType: g.goal_type,
    title: g.title,
    description: g.description,
    targetValue: g.target_value,
    currentValue: g.current_value,
    isCompleted: g.is_completed,
    startDate: g.start_date,
    endDate: g.end_date,
    createdAt: g.created_at,
  };
}

exports.getGoals = async (req, res, next) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM goals WHERE user_id = $1';
    const params = [req.userId];

    if (type) {
      sql += ' AND goal_type = $2';
      params.push(type);
    }

    sql += ' ORDER BY is_completed ASC, created_at DESC';
    const result = await query(sql, params);

    const goals = result.rows.map(formatGoal);
    res.json({ goals });
  } catch (err) {
    next(err);
  }
};

exports.createGoal = async (req, res, next) => {
  try {
    const { goalType, title, description, targetValue, startDate, endDate } = req.body;
    if (!goalType || !title) {
      return res.status(400).json({ error: 'Goal type and title are required' });
    }

    const result = await query(
      `INSERT INTO goals (user_id, goal_type, title, description, target_value, start_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.userId, goalType, title, description || null, targetValue || null, startDate || null, endDate || null]
    );

    res.status(201).json(formatGoal(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

exports.updateGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, targetValue, currentValue, isCompleted } = req.body;

    const result = await query(
      `UPDATE goals SET
       title = COALESCE($1, title),
       description = COALESCE($2, description),
       target_value = COALESCE($3, target_value),
       current_value = COALESCE($4, current_value),
       is_completed = COALESCE($5, is_completed),
       updated_at = NOW()
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [title, description, targetValue, currentValue, isCompleted, id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json(formatGoal(result.rows[0]));
  } catch (err) {
    next(err);
  }
};

exports.deleteGoal = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      'DELETE FROM goals WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Goal not found' });
    }

    res.json({ message: 'Goal deleted' });
  } catch (err) {
    next(err);
  }
};
