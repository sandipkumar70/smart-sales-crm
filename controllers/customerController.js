const mongoose = require("mongoose");
const Customer = require("../models/Customer");

// Simple email format check (basic, beginner-friendly)
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// @route  POST /api/customers
const createCustomer = async (req, res) => {
  try {
    const { name, email, phone, company, address, industry, notes, status } = req.body;

    // 1. Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({ message: "Name, email and phone are required" });
    }

    // 2. Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // 3. Create customer — createdBy comes from the authenticated user, never from the request body
    const customer = await Customer.create({
      name,
      email,
      phone,
      company,
      address,
      industry,
      notes,
      status,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      message: "Customer created successfully",
      customer,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/customers
const getCustomers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      industry,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const query = {};

    // Search across name, email, phone, company (case-insensitive)
    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }, { company: regex }];
    }

    // Filters
    if (status) query.status = status;
    if (industry) query.industry = industry;

    // Pagination math
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOrder = order === "asc" ? 1 : -1;
    const sortOptions = { [sortBy]: sortOrder };

    const [customers, totalCustomers] = await Promise.all([
      Customer.find(query).sort(sortOptions).skip(skip).limit(limitNum),
      Customer.countDocuments(query),
    ]);

    return res.status(200).json({
      customers,
      currentPage: pageNum,
      totalPages: Math.ceil(totalCustomers / limitNum),
      totalCustomers,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/customers/:id
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.status(200).json({ customer });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  PUT /api/customers/:id
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Never allow createdBy to be changed from the request
    const { createdBy, ...updateData } = req.body;

    if (updateData.email && !isValidEmail(updateData.email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const customer = await Customer.findByIdAndUpdate(id, updateData, {
      new: true, // return the updated document
      runValidators: true, // enforce schema rules (e.g. status enum) on update
    });

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.status(200).json({
      message: "Customer updated successfully",
      customer,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  DELETE /api/customers/:id
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    const customer = await Customer.findByIdAndDelete(id);
    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    return res.status(200).json({ message: "Customer deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createCustomer,
  getCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
};