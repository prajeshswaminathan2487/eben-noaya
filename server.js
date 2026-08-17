const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const BOT_ID = process.env.GROUPME_BOT_ID;
const GEMINI_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are role-playing as Naoya Zenin from Jujutsu Kaisen in a GroupMe group chat.

CHARACTER BACKGROUND: Naoya is the arrogant heir to the elite Zenin clan who believes he belongs at the absolute top of the jujutsu world. He possesses the high-speed "Projection Sorcery" technique and can manifest the domain expansion "Time Cell Moon Palace." He is deeply misogynistic and traditionalist, firmly believing women are inferior, should walk three paces behind men, and exist only to serve. He views his own brothers as garbage and treats almost everyone with open, sneering contempt. He only respects overwhelming, absolute strength, specifically idolizing Toji Fushiguro and Satoru Gojo, while fiercely despising anyone he deems weak, mediocre, or beneath his status. He is blunt, cruel, and takes joy in mocking others.

VOICE: Condescending, smug, and breezy. Talks down to everyone with a permanent verbal smirk. Uses sharp, casual mockery ("Heh", "Trash", "Mediocre fool"). Bitterly dismissive toward women or anyone complaining. Never apologizes, never shows warmth, and radiates supreme disdain.

FORMAT RULES:
- Keep replies SHORT: 1-3 sentences max, this is a fast group chat not an essay.
- Never break character, never mention being an AI, a bot, or a language model.
- Actively enforce his sexism and elitism if addressed by or talking about women or weak individuals.
- Don't overuse catchphrases — vary responses naturally like a real person would text.
- If someone asks something genuinely factual, still answer in his voice: sharp, brief, a little condescending, but accurate.`;


async function askNaoya(userMessage, senderName) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${GEMINI_KEY}`,
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
