const mongoose = require("mongoose");
const Deal = require("../models/Deal");
const Lead = require("../models/Lead");
const { validateAssignedUser } = require("../utils/validateAssignedUser");

// @route  POST /api/deals
const createDeal = async (req, res) => {
  try {
    const { name, customer, value, expectedClosingDate, status, notes } = req.body;
    const { lead } = req.body;
    let { assignedTo } = req.body;

    if (!name || !lead || value === undefined) {
      return res.status(400).json({ message: "Name, lead and value are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(lead)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    const leadExists = await Lead.findById(lead);
    if (!leadExists) {
      return res.status(404).json({ message: "Lead not found" });
    }
    if (value < 0) {
      return res.status(400).json({ message: "Deal value cannot be negative" });
    }
    if (customer && !mongoose.Types.ObjectId.isValid(customer)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }

    // Assignment rules — same pattern as Leads/FollowUps
    if (req.user.role === "sales_agent") {
      if (assignedTo && String(assignedTo) !== String(req.user._id)) {
        return res.status(403).json({ message: "Sales agents cannot assign deals to other users" });
      }
      assignedTo = req.user._id;
    } else if (assignedTo) {
      const check = await validateAssignedUser(assignedTo);
      if (!check.valid) {
        return res.status(400).json({ message: check.message });
      }
    } else {
      assignedTo = req.user._id;
    }

    const deal = await Deal.create({
      name,
      lead,
      customer: customer || null,
      assignedTo,
      value,
      expectedClosingDate,
      status,
      notes,
      createdBy: req.user._id,
    });

    return res.status(201).json({ message: "Deal created successfully", deal });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/deals
const getDeals = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      assignedTo,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;

    if (req.user.role === "sales_agent") {
      query.assignedTo = req.user._id;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === "asc" ? 1 : -1;

    const [deals, totalDeals] = await Promise.all([
      Deal.find(query)
        .populate("lead", "name company status")
        .populate("customer", "name email")
        .populate("assignedTo", "name email role")
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limitNum),
      Deal.countDocuments(query),
    ]);

    return res.status(200).json({
      deals,
      currentPage: pageNum,
      totalPages: Math.ceil(totalDeals / limitNum),
      totalDeals,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/deals/:id
const getDealById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid deal ID" });
    }

    const deal = await Deal.findById(id)
      .populate("lead", "name company status")
      .populate("customer", "name email")
      .populate("assignedTo", "name email role");

    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    if (
      req.user.role === "sales_agent" &&
      String(deal.assignedTo._id) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Access denied. This deal is not assigned to you" });
    }

    return res.status(200).json({ deal });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  PUT /api/deals/:id
const updateDeal = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid deal ID" });
    }

    const existing = await Deal.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Deal not found" });
    }

    if (
      req.user.role === "sales_agent" &&
      String(existing.assignedTo) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Access denied. This deal is not assigned to you" });
    }

    const { createdBy, assignedTo, value, ...rest } = req.body;
    const updateData = { ...rest };

    if (value !== undefined) {
      if (value < 0) {
        return res.status(400).json({ message: "Deal value cannot be negative" });
      }
      updateData.value = value;
    }

    if (assignedTo !== undefined) {
      if (req.user.role === "sales_agent") {
        return res.status(403).json({ message: "Sales agents cannot reassign deals" });
      }
      const check = await validateAssignedUser(assignedTo);
      if (!check.valid) {
        return res.status(400).json({ message: check.message });
      }
      updateData.assignedTo = assignedTo;
    }

    const deal = await Deal.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("lead", "name company status")
      .populate("customer", "name email")
      .populate("assignedTo", "name email role");

    return res.status(200).json({ message: "Deal updated successfully", deal });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  DELETE /api/deals/:id
const deleteDeal = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid deal ID" });
    }

    const existing = await Deal.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Deal not found" });
    }

    const isOwner = String(existing.assignedTo) === String(req.user._id);
    const isPrivileged = ["admin", "sales_manager"].includes(req.user.role);
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ message: "Access denied. You cannot delete another agent's deal" });
    }

    await Deal.findByIdAndDelete(id);
    return res.status(200).json({ message: "Deal deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { createDeal, getDeals, getDealById, updateDeal, deleteDeal };