const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    totalSpend: Number,
    visitCount: Number,
    lastOrderDate: Date,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Customer", customerSchema);
