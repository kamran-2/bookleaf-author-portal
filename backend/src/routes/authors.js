const router = require('express').Router();
router.get('/ping', (req, res) => res.json({ route: 'authors' }));
module.exports = router;
