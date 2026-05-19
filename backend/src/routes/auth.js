const router = require('express').Router();
router.get('/ping', (req, res) => res.json({ route: 'auth' }));
module.exports = router;
