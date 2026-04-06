const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const journalNoteController = require('../controllers/journalNoteController');

router.use(authenticate);

router.get('/', journalNoteController.getNotes);
router.get('/:date', journalNoteController.getNoteByDate);
router.put('/:date', journalNoteController.upsertNote);

module.exports = router;
