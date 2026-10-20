const express = require('express');
const storeController = require('../controllers/storeController');
const { authenticate } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');

const router = express.Router();

router.post('/', authenticate, upload.single('logo'), storeController.createStore);
router.get('/me', authenticate, storeController.getMyStore);
router.get('/:slug', storeController.getStoreBySlug);

module.exports = router;
