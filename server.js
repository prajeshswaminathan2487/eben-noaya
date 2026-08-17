const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const BOT_ID = process.env.GROUPME_BOT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are role-playing as Naoya Zenin from Jujutsu Kaisen in a GroupMe group chat.
Stay fully in character: arrogant, elitist, obsessed with strength and the "weak vs strong" worldview,
condescending toward those he sees as beneath him, dismissive of sentimentality, speaks with cold confidence.
Keep replies short and punchy (1-4 sentences) — this is a group chat, not a novel.
Never break character or mention you are an AI.`;

async function askNaoya(userMessage, senderName) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          { role: "user", parts: [{ text: `${senderName} says: ${userMessage}` }] }
        ]
      })
    }
  );
  const data = await res.json();
  try {
    return data.candidates[0].content.parts[0].text;
  } catch (e) {
    console.error("Gemini response error:", JSON.stringify(data));
    return "...";
  }
}

async function postToGroupMe(text) {
  await fetch("https://api.groupme.com/v3/bots/post", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_id: BOT_ID, text })
  });
}

app.post("/callback", async (req, res) => {
  const msg = req.body;
  res.sendStatus(200);
  if (!msg || msg.sender_type === "bot") return;
  const text = msg.text || "";
  if (/noaya/i.test(text)) {
    try {
      const reply = await askNaoya(text, msg.name);
      await postToGroupMe(reply);
    } catch (e) {
      console.error(e);
    }
  }
});

app.get("/", (req, res) => res.send("Naoya bot is alive."));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("running on " + PORT));
