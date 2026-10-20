const express = require('express');
const productController = require('../controllers/productController');

const router = express.Router();

// Vitrine pública da Looma (rotas estáticas antes de /:id)
router.get('/categories', productController.listCategories);
router.get('/', productController.listPublicProducts);
router.get('/:id', productController.getPublicProduct);

module.exports = router;
