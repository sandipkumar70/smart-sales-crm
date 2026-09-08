const mongoose = require("mongoose");
const FollowUp = require("../models/FollowUp");
const Lead = require("../models/Lead");
const { validateAssignedUser } = require("../utils/validateAssignedUser");

// @route  POST /api/followups
const createFollowUp = async (req, res) => {
  try {
    const { customer, dueDate, type, notes, status } = req.body;
    const { lead } = req.body;
    let { assignedTo } = req.body;

    // 1. Validate required fields
    if (!lead || !dueDate) {
      return res.status(400).json({ message: "Lead and due date are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(lead)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }
    const leadExists = await Lead.findById(lead);
    if (!leadExists) {
      return res.status(404).json({ message: "Lead not found" });
    }
    if (customer && !mongoose.Types.ObjectId.isValid(customer)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }
    if (isNaN(new Date(dueDate).getTime())) {
      return res.status(400).json({ message: "Invalid due date" });
    }

    // 2. Assignment rules — same pattern as Leads: agents can only assign to themselves
    if (req.user.role === "sales_agent") {
      if (assignedTo && String(assignedTo) !== String(req.user._id)) {
        return res.status(403).json({ message: "Sales agents cannot assign follow-ups to other users" });
      }
      assignedTo = req.user._id;
    } else if (assignedTo) {
      const check = await validateAssignedUser(assignedTo);
      if (!check.valid) {
        return res.status(400).json({ message: check.message });
      }
    } else {
      // Admin/manager did not specify — default to themselves
      assignedTo = req.user._id;
    }

    const followUp = await FollowUp.create({
      lead,
      customer: customer || null,
      assignedTo,
      dueDate,
      type,
      notes,
      status,
      createdBy: req.user._id,
    });

    return res.status(201).json({ message: "Follow-up created successfully", followUp });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/followups
const getFollowUps = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      lead,
      assignedTo,
      startDate,
      endDate,
      sortBy = "dueDate",
      order = "asc",
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (lead) query.lead = lead;
    if (assignedTo) query.assignedTo = assignedTo;

    // Simple due-date range filter
    if (startDate || endDate) {
      query.dueDate = {};
      if (startDate) query.dueDate.$gte = new Date(startDate);
      if (endDate) query.dueDate.$lte = new Date(endDate);
    }

    // Sales agents only see their own assigned follow-ups
    if (req.user.role === "sales_agent") {
      query.assignedTo = req.user._id;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;
    const sortOrder = order === "desc" ? -1 : 1;

    const [followUps, totalFollowUps] = await Promise.all([
      FollowUp.find(query)
        .populate("lead", "name company status")
        .populate("customer", "name email")
        .populate("assignedTo", "name email role")
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limitNum),
      FollowUp.countDocuments(query),
    ]);

    return res.status(200).json({
      followUps,
      currentPage: pageNum,
      totalPages: Math.ceil(totalFollowUps / limitNum),
      totalFollowUps,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/followups/:id
const getFollowUpById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid follow-up ID" });
    }

    const followUp = await FollowUp.findById(id)
      .populate("lead", "name company status")
      .populate("customer", "name email")
      .populate("assignedTo", "name email role");

    if (!followUp) {
      return res.status(404).json({ message: "Follow-up not found" });
    }

    if (
      req.user.role === "sales_agent" &&
      String(followUp.assignedTo._id) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Access denied. This follow-up is not assigned to you" });
    }

    return res.status(200).json({ followUp });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  PUT /api/followups/:id
const updateFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid follow-up ID" });
    }

    const existing = await FollowUp.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Follow-up not found" });
    }

    if (
      req.user.role === "sales_agent" &&
      String(existing.assignedTo) !== String(req.user._id)
    ) {
      return res.status(403).json({ message: "Access denied. This follow-up is not assigned to you" });
    }

    const { createdBy, assignedTo, dueDate, ...rest } = req.body;
    const updateData = { ...rest };

    if (dueDate !== undefined) {
      if (isNaN(new Date(dueDate).getTime())) {
        return res.status(400).json({ message: "Invalid due date" });
      }
      updateData.dueDate = dueDate;
    }

    if (assignedTo !== undefined) {
      if (req.user.role === "sales_agent") {
        return res.status(403).json({ message: "Sales agents cannot reassign follow-ups" });
      }
      const check = await validateAssignedUser(assignedTo);
      if (!check.valid) {
        return res.status(400).json({ message: check.message });
      }
      updateData.assignedTo = assignedTo;
    }

    const followUp = await FollowUp.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("lead", "name company status")
      .populate("customer", "name email")
      .populate("assignedTo", "name email role");

    return res.status(200).json({ message: "Follow-up updated successfully", followUp });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  DELETE /api/followups/:id
const deleteFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid follow-up ID" });
    }

    const existing = await FollowUp.findById(id);
    if (!existing) {
      return res.status(404).json({ message: "Follow-up not found" });
    }

    // Agents/managers can delete their own; admin and sales_manager can delete any
    const isOwner = String(existing.assignedTo) === String(req.user._id);
    const isPrivileged = ["admin", "sales_manager"].includes(req.user.role);
    if (!isOwner && !isPrivileged) {
      return res.status(403).json({ message: "Access denied. You can only delete your own follow-ups" });
    }

    await FollowUp.findByIdAndDelete(id);
    return res.status(200).json({ message: "Follow-up deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  createFollowUp,
  getFollowUps,
  getFollowUpById,
  updateFollowUp,
  deleteFollowUp,
};