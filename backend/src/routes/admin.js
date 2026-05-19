const router = require('express').Router();
router.get('/ping', (req, res) => res.json({ route: 'admin' }));
module.exports = router;
