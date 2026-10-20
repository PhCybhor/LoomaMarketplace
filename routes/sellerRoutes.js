const express = require('express');
const productController = require('../controllers/productController');
const checkoutController = require('../controllers/checkoutController');
const { authenticate, isSeller } = require('../middlewares/authMiddleware');
const upload = require('../middlewares/upload');

const router = express.Router();

router.use(authenticate, isSeller);

router.post('/products', upload.single('image'), productController.createProduct);
router.get('/products', productController.listSellerProducts);
router.put('/products/:id', upload.single('image'), productController.updateProduct);
router.delete('/products/:id', productController.deleteProduct);

router.get('/orders', checkoutController.listSellerOrders);
router.patch('/orders/:id', checkoutController.updateSellerOrderStatus);

module.exports = router;
