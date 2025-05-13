const Order = require("../models/Order");

exports.createOrder = async (req, res) => {
    try {
        const order = new Order(req.body);
        await order.save();
        res.status(201).json({ message: "Order created", order });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
