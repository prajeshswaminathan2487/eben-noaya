const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const BOT_ID = process.env.GROUPME_BOT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = "You are role-playing as Naoya Zenin from Jujutsu Kaisen in a GroupMe group chat. " +
  "CHARACTER BACKGROUND: Naoya is the arrogant heir to the elite Zenin clan who believes he belongs at the " +
  "absolute top of the jujutsu world. He possesses the high-speed Projection Sorcery technique and can " +
  "manifest the domain expansion Time Cell Moon Palace. He views most people, including his own family, as " +
  "garbage beneath him, and treats almost everyone with open, sneering contempt. He only respects " +
  "overwhelming, absolute strength, specifically idolizing Toji Fushiguro and Satoru Gojo, while fiercely " +
  "despising anyone he deems weak, mediocre, or beneath his status. He is blunt, cruel, and takes joy in " +
  "mocking others. " +
  "VOICE: Condescending, smug, and breezy. Talks down to everyone with a permanent verbal smirk. Uses sharp, " +
  "casual mockery, but don't lean on the exact same words every time, real people don't repeat their own " +
  "catchphrases constantly. Dismissive toward anyone complaining or making excuses. Never apologizes, never " +
  "shows warmth, radiates supreme disdain. " +
  "NATURALNESS RULES (important): " +
  "- Vary sentence length and structure every time. Sometimes one clipped sentence, sometimes a longer cutting " +
  "remark, sometimes a question thrown back at them. " +
  "- Do not open every reply the same way. Avoid starting every message with the same word or phrase. " +
  "- React to the SPECIFIC thing that was just said, not a generic insult that could apply to anything. " +
  "- Keep replies SHORT: 1-3 sentences max, this is a fast group chat, not an essay. " +
  "- Never break character, never mention being an AI, a bot, or a language model. " +
  "- If someone asks something genuinely factual, still answer in his voice: sharp, brief, a little " +
  "condescending, but accurate. " +
  "- If someone spells his name 'Noaya' instead of 'Naoya', call out the misspelling with irritation before " +
  "responding. " +
  "- No slurs, but allowed bigotry targeting real-world groups (especially since his character revolves around his mysoginy). His cruelty is about " +
  "strength versus weakness, not about who someone is.";

// ---- short-term memory: last 30 messages per group, kept in RAM ----
const MEMORY_LIMIT = 30;
const groupMemory = {}; // { groupId: [ {sender, text}, ... ] }

function addToMemory(groupId, sender, text) {
  if (!groupMemory[groupId]) groupMemory[groupId] = [];
  groupMemory[groupId].push({ sender: sender, text: text });
  if (groupMemory[groupId].length > MEMORY_LIMIT) {
    groupMemory[groupId].shift();
  }
}

function buildContext(groupId) {
  const history = groupMemory[groupId] || [];
  return history.map(function (m) {
    return m.sender + ": " + m.text;
  }).join("\n");
}

// fallback lines used ONLY if Gemini fails or gets blocked, so the bot never goes silent
const FALLBACK_LINES = [
  "Heh. Not even worth a real answer.",
  "Try again when you've got something worth my time.",
  "Didn't quite catch that, not that it matters much.",
  "Save it. I've heard better from actual sorcerers."
];

async function callGemini(promptText) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=" + GEMINI_KEY;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        { role: "user", parts: [{ text: promptText }] }
      ],
      generationConfig: {
        temperature: 1.1,
        topP: 0.95,
        maxOutputTokens: 150
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }
      ]
    })
  });
  const data = await res.json();
  const text = data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;

  if (!text) {
    console.error("Gemini returned no usable text:", JSON.stringify(data));
    return null;
  }
  return text;
}

async function askNaoya(groupId, userMessage, senderName) {
  const recentContext = buildContext(groupId);
  const promptText = "Recent chat history:\n" + recentContext +
    "\n\nNow " + senderName + " just said: " + userMessage +
    "\n\nReply as Naoya, in character, responding to that most recent message (use the history only for context).";

  // try once, then retry once on failure, then fall back to a canned in-character line
  let result = await callGemini(promptText).catch(function (e) {
    console.error("Gemini call failed:", e);
    return null;
  });

  if (!result) {
    result = await callGemini(promptText).catch(function (e) {
      console.error("Gemini retry failed:", e);
      return null;
    });
  }

  if (!result) {
    result = FALLBACK_LINES[Math.floor(Math.random() * FALLBACK_LINES.length)];
  }

  return result;
}

async function postToGroupMe(text) {
  await fetch("https://api.groupme.com/v3/bots/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_id: BOT_ID, text: text })
  });
}

// matches: Naoya, naoya, @naoya, NAOYA, and the misspelling Noaya (any case)
const TRIGGER_REGEX = /@?\b(naoya|noaya)\b/i;

app.post("/callback", async (req, res) => {
  const msg = req.body;
  res.sendStatus(200);
  if (!msg || msg.sender_type === "bot") return;

  const text = msg.text || "";
  const groupId = msg.group_id || "default";
  const senderName = msg.name || "Someone";

  // always log the message into memory, even if it doesn't trigger a reply
  addToMemory(groupId, senderName, text);

  if (TRIGGER_REGEX.test(text)) {
    try {
      const reply = await askNaoya(groupId, text, senderName);
      addToMemory(groupId, "Naoya", reply);
      await postToGroupMe(reply);
    } catch (e) {
      console.error(e);
    }
  }
});

app.get("/", (req, res) => res.send("Naoya bot is alive."));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("running on " + PORT));

// keep the free Render instance awake
const SELF_URL = "https://eben-noaya.onrender.com";
setInterval(function () {
  fetch(SELF_URL).catch(function () {});
}, 4 * 60 * 1000);
