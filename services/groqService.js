const Groq = require("groq-sdk");

let groqClient = null;

// Lazily create the client so a missing key doesn't crash the server at startup —
// it only fails when an AI feature is actually used.
const getClient = () => {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
};

// Sends a prompt to Groq and returns PARSED, VALIDATED JSON.
// `validate` is a function that throws if the shape/values are wrong —
// this is what stops us from blindly trusting arbitrary AI output.
const askGroqForJSON = async (systemPrompt, userPrompt, validate) => {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: "openai/gpt-oss-120b",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.4,
    response_format: { type: "json_object" },
  });

  const rawText = completion.choices?.[0]?.message?.content;
  if (!rawText) {
    throw new Error("Empty response from AI");
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("AI returned invalid JSON");
  }

  validate(parsed); // throws if invalid — caller catches and returns a clean error
  return parsed;
};

module.exports = { askGroqForJSON };