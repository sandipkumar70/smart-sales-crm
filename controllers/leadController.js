const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const { validateAssignedUser } = require("../utils/validateAssignedUser");

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Linear order of the "normal" sales flow. "lost" is handled separately
// because a deal can be marked lost from almost any stage.
const STATUS_ORDER = ["new", "contacted", "interested", "negotiation", "won"];

// Simple, explainable status transition rule:
// - No change -> always fine
// - Moving TO "lost" -> allowed, UNLESS the lead is already closed (won/lost)
// - "won" or "lost" are terminal -> no further changes once reached
// - Otherwise only one step forward or one step backward in STATUS_ORDER is allowed
const isValidStatusTransition = (currentStatus, newStatus) => {
  if (currentStatus === newStatus) return true;

  if (currentStatus === "won" || currentStatus === "lost") return false;

  if (newStatus === "lost") return true;

  const currentIndex = STATUS_ORDER.indexOf(currentStatus);
  const newIndex = STATUS_ORDER.indexOf(newStatus);
  if (currentIndex === -1 || newIndex === -1) return false;

  return Math.abs(newIndex - currentIndex) === 1;
};

// @route  POST /api/leads
const createLead = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      company,
      source,
      interestedProduct,
      expectedValue,
      priority,
      notes,
    } = req.body;
    let { assignedTo } = req.body;

    // 1. Validate required fields
    if (!name || !email || !phone) {
      return res.status(400).json({ message: "Name, email and phone are required" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }
    if (expectedValue !== undefined && expectedValue < 0) {
      return res.status(400).json({ message: "Expected value cannot be negative" });
    }

    // 2. Assignment rules
    // Sales agents cannot assign a lead to anyone else — only to themselves.
    if (req.user.role === "sales_agent") {
      if (assignedTo && String(assignedTo) !== String(req.user._id)) {
        return res.status(403).json({ message: "Sales agents cannot assign leads to other users" });
      }
      // A lead created by an agent defaults to being assigned to that agent
      assignedTo = req.user._id;
    } else if (assignedTo) {
      // Admin / sales_manager: validate the target user if one was provided
      const check = await validateAssignedUser(assignedTo);
      if (!check.valid) {
        return res.status(400).json({ message: check.message });
      }
    }

    // 3. Create lead — createdBy always comes from the authenticated user
    const lead = await Lead.create({
      name,
      email,
      phone,
      company,
      source,
      interestedProduct,
      expectedValue,
      priority,
      notes,
      assignedTo: assignedTo || null,
      createdBy: req.user._id,
    });

    return res.status(201).json({ message: "Lead created successfully", lead });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/leads
const getLeads = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      status,
      priority,
      source,
      assignedTo,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    const query = {};

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ name: regex }, { email: regex }, { phone: regex }, { company: regex }];
    }

    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (source) query.source = source;
    if (assignedTo) query.assignedTo = assignedTo;

    // Sales agents can only ever see leads assigned to them — this overrides
    // any assignedTo value they might pass in the query string.
    if (req.user.role === "sales_agent") {
      query.assignedTo = req.user._id;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;

    const sortOrder = order === "asc" ? 1 : -1;
    const sortOptions = { [sortBy]: sortOrder };

    const [leads, totalLeads] = await Promise.all([
      Lead.find(query)
        .populate("assignedTo", "name email role")
        .populate("customer", "name email")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum),
      Lead.countDocuments(query),
    ]);

    return res.status(200).json({
      leads,
      currentPage: pageNum,
      totalPages: Math.ceil(totalLeads / limitNum),
      totalLeads,
    });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/leads/:id
const getLeadById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }

    const lead = await Lead.findById(id)
      .populate("assignedTo", "name email role")
      .populate("customer", "name email")
      .populate("createdBy", "name email role");

    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Sales agents may only view leads assigned to them
    if (
      req.user.role === "sales_agent" &&
      (!lead.assignedTo || String(lead.assignedTo._id) !== String(req.user._id))
    ) {
      return res.status(403).json({ message: "Access denied. This lead is not assigned to you" });
    }

    return res.status(200).json({ lead });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  PUT /api/leads/:id
const updateLead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }

    const existingLead = await Lead.findById(id);
    if (!existingLead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    // Sales agents may only update leads assigned to them
    if (
      req.user.role === "sales_agent" &&
      (!existingLead.assignedTo || String(existingLead.assignedTo) !== String(req.user._id))
    ) {
      return res.status(403).json({ message: "Access denied. This lead is not assigned to you" });
    }

    // Never allow createdBy to be changed from the request
    const { createdBy, assignedTo, status, expectedValue, email, ...rest } = req.body;
    const updateData = { ...rest };

    if (email) {
      if (!isValidEmail(email)) {
        return res.status(400).json({ message: "Invalid email format" });
      }
      updateData.email = email;
    }

    if (expectedValue !== undefined) {
      if (expectedValue < 0) {
        return res.status(400).json({ message: "Expected value cannot be negative" });
      }
      updateData.expectedValue = expectedValue;
    }

    // Status transition check
    if (status && status !== existingLead.status) {
      if (!isValidStatusTransition(existingLead.status, status)) {
        return res.status(400).json({
          message: `Invalid status change from '${existingLead.status}' to '${status}'`,
        });
      }
      updateData.status = status;
    }

    // Assignment rules on update
    if (assignedTo !== undefined) {
      if (req.user.role === "sales_agent") {
        return res.status(403).json({ message: "Sales agents cannot reassign leads" });
      }
      const check = await validateAssignedUser(assignedTo);
      if (!check.valid) {
        return res.status(400).json({ message: check.message });
      }
      updateData.assignedTo = assignedTo;
    }

    const lead = await Lead.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("assignedTo", "name email role")
      .populate("customer", "name email");

    return res.status(200).json({ message: "Lead updated successfully", lead });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  DELETE /api/leads/:id
const deleteLead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid lead ID" });
    }

    const lead = await Lead.findByIdAndDelete(id);
    if (!lead) {
      return res.status(404).json({ message: "Lead not found" });
    }

    return res.status(200).json({ message: "Lead deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @route  GET /api/leads/pipeline
const getPipeline = async (req, res) => {
  try {
    const query = {};

    // Same scoping rule as getLeads: agents only see their own leads
    if (req.user.role === "sales_agent") {
      query.assignedTo = req.user._id;
    }

    const leads = await Lead.find(query)
      .select("name company expectedValue priority assignedTo status")
      .populate("assignedTo", "name email");

    const pipeline = {
      new: [],
      contacted: [],
      interested: [],
      negotiation: [],
      won: [],
      lost: [],
    };

    leads.forEach((lead) => {
      pipeline[lead.status].push(lead);
    });

    const counts = {
      new: pipeline.new.length,
      contacted: pipeline.contacted.length,
      interested: pipeline.interested.length,
      negotiation: pipeline.negotiation.length,
      won: pipeline.won.length,
      lost: pipeline.lost.length,
    };

    return res.status(200).json({ pipeline, counts });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};


module.exports = { createLead, getLeads, getLeadById, updateLead, deleteLead, getPipeline };