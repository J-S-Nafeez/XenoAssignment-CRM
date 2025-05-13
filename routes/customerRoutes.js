const express = require("express");
const router = express.Router();
// Replace with your actual controller function
const { createCustomer } = require("../controllers/customerController");

router.post("/", createCustomer);

module.exports = router;
