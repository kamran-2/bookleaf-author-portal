const router = require('express').Router();
router.get('/ping', (req, res) => res.json({ route: 'tickets' }));
module.exports = router;
