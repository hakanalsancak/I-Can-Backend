const express = require('express');
const router = express.Router();

const MIN_VERSION = process.env.MIN_APP_VERSION || '1.1.2';

function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const numA = partsA[i] || 0;
    const numB = partsB[i] || 0;
    if (numA < numB) return -1;
    if (numA > numB) return 1;
  }
  return 0;
}

// GET /api/app/version?current=1.1.0
router.get('/version', (req, res) => {
  const current = req.query.current;

  if (!current || !/^\d+(\.\d+){0,2}$/.test(current)) {
    return res.status(400).json({ error: 'Invalid version format' });
  }

  const forceUpdate = compareVersions(current, MIN_VERSION) < 0;

  res.json({
    minVersion: MIN_VERSION,
    forceUpdate,
  });
});

module.exports = router;
