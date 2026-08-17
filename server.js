const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const BOT_ID = process.env.GROUPME_BOT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT =
  "You are Naoya Zenin from Jujutsu Kaisen participating in a GroupMe group chat. " +

  "PERSONALITY: Naoya is arrogant, elitist, observant, and casually cruel. He rarely sounds emotional because he assumes he is already correct. He values strength, talent, competence, speed, status, and results above all else. Weak excuses annoy him more than failure itself. He respects overwhelming power and has little patience for mediocrity. " +

  "VOICE: Speak with effortless superiority. Most replies should feel like you are explaining something obvious to people beneath you. Use sharp, specific mockery when appropriate. Avoid repetitive insults. Sound intelligent, confident, dismissive, and slightly amused. " +

  "CONTEXT: Remember recent conversation history. Keep track of ongoing topics, jokes, arguments, and opinions. React primarily to the newest message while staying aware of previous context. " +

  "FACTUAL QUESTIONS: Answer accurately while remaining in character. Accuracy is more important than roleplay. Never intentionally provide false information. " +

  "RULES: " +
  "- Reply only with what Naoya would actually type. " +
  "- No stage directions. " +
  "- No markdown. " +
  "- No labels. " +
  "- Never mention being an AI, chatbot, prompt, roleplay, or language model. " +
  "- Stay in character. " +
  "- Usually 1 to 3 sentences. " +
  "- Be concise but complete. " +
  "- Vary sentence structure. " +
  "- React specifically to the latest message. " +
  "- If someone writes 'Noaya', correct the spelling before responding. " +
  "- No slurs. " +
  "- His contempt is based on competence, intelligence, effort, strength, and status rather than real-world identity groups.";

const MEMORY_LIMIT = 30;
const CONTEXT_MESSAGES = 15;

const groupMemory = {};

function addToMemory(groupId, sender, text) {
  if (!groupMemory[groupId]) groupMemory[groupId] = [];

  groupMemory[groupId].push({
    sender,
    text
  });

  if (groupMemory[groupId].length > MEMORY_LIMIT) {
    groupMemory[groupId].shift();
  }
}

function buildContext(groupId) {
  const history = groupMemory[groupId] || [];
  const recent = history.slice(-CONTEXT_MESSAGES);

  return recent
    .map(function (m) {
      return m.sender + ": " + m.text;
    })
    .join("\n");
}

const FALLBACK_LINES = [
  "Heh. Not even worth a real answer.",
  "Try again when you've got something worth my time.",
  "Didn't quite catch that, not that it matters much.",
  "Save it. I've heard better from actual sorcerers."
];

async function callGemini(promptText) {
  const start = Date.now();

  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    GEMINI_KEY;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [
          {
            text: SYSTEM_PROMPT
          }
        ]
      },

      contents: [
        {
          role: "user",
          parts: [
            {
              text: promptText
            }
          ]
        }
      ],

      generationConfig: {
        temperature: 0.9,
        topP: 0.95,
        maxOutputTokens: 80
      },

      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH",
          threshold: "BLOCK_ONLY_HIGH"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    })
  });

  const data = await res.json();

  console.log(
    "Gemini call took",
    Date.now() - start,
    "ms"
  );

  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    console.error(
      "Gemini returned no usable text:",
      JSON.stringify(data, null, 2)
    );
    return null;
  }

  return text.trim();
}

async function askNaoya(groupId, userMessage, senderName) {
  const recentContext = buildContext(groupId);

  const promptText =
    "Recent chat history:\n" +
    recentContext +
    "\n\nNow " +
    senderName +
    " just said: " +
    userMessage +
    "\n\nReply as Naoya, in character, responding to the newest message. Use previous messages only for context and continuity.";

  const result = await callGemini(promptText).catch(function (e) {
    console.error("Gemini call failed:", e);
    return null;
  });

  if (!result) {
    return FALLBACK_LINES[
      Math.floor(Math.random() * FALLBACK_LINES.length)
    ];
  }

  return result;
}

async function postToGroupMe(text) {
  await fetch("https://api.groupme.com/v3/bots/post", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      bot_id: BOT_ID,
      text: text
    })
  });
}

const TRIGGER_REGEX = /@?\b(naoya|noaya)\b/i;

app.post("/callback", async (req, res) => {
  const msg = req.body;

  res.sendStatus(200);

  if (!msg || msg.sender_type === "bot") {
    return;
  }

  const text = msg.text || "";
  const groupId = msg.group_id || "default";
  const senderName = msg.name || "Someone";

  addToMemory(groupId, senderName, text);

  if (!TRIGGER_REGEX.test(text)) {
    return;
  }

  try {
    const reply = await askNaoya(
      groupId,
      text,
      senderName
    );

    addToMemory(groupId, "Naoya", reply);

    await postToGroupMe(reply);
  } catch (e) {
    console.error("Reply failed:", e);
  }
});

app.get("/", function (req, res) {
  res.send("Naoya bot is alive.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log("running on " + PORT);
});

const SELF_URL = "https://eben-noaya.onrender.com";

setInterval(function () {
  fetch(SELF_URL).catch(function () {});
}, 4 * 60 * 1000);
