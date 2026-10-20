const express = require('express');
const checkoutController = require('../controllers/checkoutController');
const { authenticate } = require('../middlewares/authMiddleware');

const router = express.Router();

router.post('/checkout', authenticate, checkoutController.checkout);
router.get('/orders/me', authenticate, checkoutController.listBuyerOrders);

module.exports = router;
