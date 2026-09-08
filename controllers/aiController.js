const mongoose = require("mongoose");
const Lead = require("../models/Lead");
const { askGroqForJSON } = require("../services/groqService");

// Builds a compact, consistent description of a lead for any AI prompt
const describeLead = (lead) => `
Name: ${lead.name}
Company: ${lead.company || "Unknown"}
Source: ${lead.source}
Interested Product: ${lead.interestedProduct || "Not specified"}
Expected Value: ₹${lead.expectedValue}
Priority: ${lead.priority}
Status: ${lead.status}
Notes: ${lead.notes || "None"}
`.trim();

const getLeadOr404 = async (id, res) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: "Invalid lead ID" });
    return null;
  }
  const lead = await Lead.findById(id);
  if (!lead) {
    res.status(404).json({ message: "Lead not found" });
    return null;
  }
  return lead;
};

// Score -> category is computed HERE, not trusted from the AI, so the
// 0-39/40-69/70-100 boundaries are always exact regardless of what the model says.
const categoryForScore = (score) => {
  if (score >= 70) return "Hot";
  if (score >= 40) return "Warm";
  return "Cold";
};

// @route  POST /api/ai/lead-score
const scoreLead = async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ message: "leadId is required" });

    const lead = await getLeadOr404(leadId, res);
    if (!lead) return;

    const result = await askGroqForJSON(
      "You are a sales assistant for a CRM. Score how promising a lead is for the sales team. Respond ONLY with strict JSON: { \"score\": <integer 0-100>, \"reason\": \"<one or two sentence explanation>\" }. No extra text.",
      `Score this lead:\n${describeLead(lead)}`,
      (parsed) => {
        if (typeof parsed.score !== "number" || parsed.score < 0 || parsed.score > 100) {
          throw new Error("score must be a number between 0 and 100");
        }
        if (typeof parsed.reason !== "string" || !parsed.reason.trim()) {
          throw new Error("reason must be a non-empty string");
        }
      }
    );

    const score = Math.round(result.score);

    return res.status(200).json({
      score,
      category: categoryForScore(score),
      reason: result.reason,
    });
  } catch (error) {
    return res.status(502).json({ message: "AI lead scoring failed", error: error.message });
  }
};

// @route  POST /api/ai/followup-message
const generateFollowupMessage = async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ message: "leadId is required" });

    const lead = await getLeadOr404(leadId, res);
    if (!lead) return;

    const result = await askGroqForJSON(
      "You are a sales assistant for a CRM. Write a short, professional follow-up message a sales agent can send to a lead. Respond ONLY with strict JSON: { \"message\": \"<the follow-up message>\" }. No extra text.",
      `Write a follow-up message for this lead:\n${describeLead(lead)}`,
      (parsed) => {
        if (typeof parsed.message !== "string" || !parsed.message.trim()) {
          throw new Error("message must be a non-empty string");
        }
      }
    );

    return res.status(200).json({ message: result.message });
  } catch (error) {
    return res.status(502).json({ message: "AI follow-up generation failed", error: error.message });
  }
};

// @route  POST /api/ai/conversion-probability
const conversionProbability = async (req, res) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ message: "leadId is required" });

    const lead = await getLeadOr404(leadId, res);
    if (!lead) return;

    const result = await askGroqForJSON(
      "You are a sales assistant for a CRM. Estimate the probability (as a rough AI-generated estimate, NOT a statistically validated prediction) that this lead will convert into a paying customer. Respond ONLY with strict JSON: { \"probability\": <integer 0-100>, \"explanation\": \"<one or two sentence explanation>\" }. No extra text.",
      `Estimate conversion probability for this lead:\n${describeLead(lead)}`,
      (parsed) => {
        if (typeof parsed.probability !== "number" || parsed.probability < 0 || parsed.probability > 100) {
          throw new Error("probability must be a number between 0 and 100");
        }
        if (typeof parsed.explanation !== "string" || !parsed.explanation.trim()) {
          throw new Error("explanation must be a non-empty string");
        }
      }
    );

    return res.status(200).json({
      probability: Math.round(result.probability),
      explanation: result.explanation,
    });
  } catch (error) {
    return res.status(502).json({ message: "AI conversion estimate failed", error: error.message });
  }
};

module.exports = { scoreLead, generateFollowupMessage, conversionProbability };