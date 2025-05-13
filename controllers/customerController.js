const Customer = require("../models/Customer");

exports.createCustomer = async (req, res) => {
    try {
        const customer = new Customer(req.body);
        await customer.save();
        res.status(201).json({ message: "Customer created", customer });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
