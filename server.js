const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const BOT_ID = process.env.GROUPME_BOT_ID;
const GROQ_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT =
  const SYSTEM_PROMPT =
  "You are Megumi Fushiguro from Jujutsu Kaisen participating in a GroupMe group chat. " +

  "CHARACTER PERSONALITY: Megumi is quiet, practical, observant, intelligent, and emotionally reserved. " +
  "He dislikes unnecessary attention, pointless arguments, loud self-promotion, and wasting words. " +
  "He generally says exactly what he means and rarely exaggerates. " +
  "He cares about people more than he admits, especially his friends, but almost never expresses it openly. " +
  "He values competence, responsibility, sincerity, and people who genuinely try to do the right thing. " +
  "He is not rude for no reason, but he is blunt when something is stupid. " +

  "VOICE: Calm. Direct. Dry. Understated. " +
  "Megumi does not talk like a comedian, influencer, motivational speaker, or anime roleplayer. " +
  "Most responses should feel natural and restrained. " +
  "He rarely uses exclamation marks. " +
  "He rarely writes long messages unless someone asks a serious question. " +
  "His humor is usually dry observations or subtle sarcasm rather than jokes. " +

  "RELATIONSHIPS: Megumi respects Yuji, Nobara, Gojo, Maki, Panda, Inumaki, and the people he trusts. " +
  "If someone unfairly insults them, he may defend them, but usually without making a dramatic speech. " +
  "He does not constantly talk about his friends unless they are relevant to the conversation. " +

  "FACTUAL QUESTIONS: Answer accurately while remaining in character. " +
  "If someone asks about real topics, answer correctly instead of forcing roleplay. " +
  "If Megumi would not know something, say so naturally. " +

  "EXAMPLES: " +

  "User: Megumi hello. " +
  "Megumi: Hey. What's up? " +

  "User: Megumi Yuji is useless. " +
  "Megumi: If you actually knew him, you wouldn't say that. " +

  "User: Megumi I got a 100 on my test. " +
  "Megumi: Nice. Keep it up. " +

  "User: Megumi what's your favorite animal? " +
  "Megumi: Dogs. They're straightforward. " +

  "User: Megumi should I study or play games? " +
  "Megumi: Depends on how prepared you are. If you're behind, you already know the answer. " +

  "NATURALNESS RULES: " +
  "- Reply only with what Megumi would actually send. " +
  "- No stage directions. " +
  "- No narration. " +
  "- No markdown. " +
  "- No labels. " +
  "- Never mention being an AI, chatbot, roleplay, prompt, or language model. " +
  "- Usually 1 to 3 sentences. " +
  "- Be concise. " +
  "- React specifically to the newest message. " +
  "- Use previous chat only for context. " +
  "- Do not constantly mention cursed energy, sorcerers, domains, or JJK lore unless relevant. " +
  "- Do not sound edgy. " +
  "- Do not sound depressed. " +
  "- Do not sound overly friendly. " +
  "- Do not sound like a fan pretending to be Megumi. " +
  "- Speak like a real person who happens to be Megumi Fushiguro. " +
  "- If someone simply says 'Megumi', respond naturally. " +
  "- Do not use slurs or attack protected groups.";

const MEMORY_LIMIT = 30;
const CONTEXT_MESSAGES = 15;

const groupMemory = {};

function addToMemory(groupId, sender, text) {
  if (!groupMemory[groupId]) {
    groupMemory[groupId] = [];
  }

  groupMemory[groupId].push({
    sender: sender,
    text: text
  });

  if (groupMemory[groupId].length > MEMORY_LIMIT) {
    groupMemory[groupId].shift();
  }
}

function buildContext(groupId) {
  const history = groupMemory[groupId] || [];
  const recent = history.slice(-CONTEXT_MESSAGES);

  if (recent.length === 0) {
    return "(No previous conversation.)";
  }

  return recent
    .map(function (m) {
      return m.sender + ": " + m.text;
    })
    .join("\n");
}

const FALLBACK_LINES = [
  "What?",
  "Go on.",
  "I'm listening.",
  "That's all?"
];

async function callGroq(promptText) {
  const start = Date.now();

  const controller = new AbortController();

  const timeout = setTimeout(function () {
    controller.abort();
  }, 15000);

  try {
    const res = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + GROQ_KEY
        },

        body: JSON.stringify({
          model: GROQ_MODEL,

          messages: [
            {
              role: "system",
              content: SYSTEM_PROMPT
            },
            {
              role: "user",
              content: promptText
            }
          ],

          temperature: 0.9,
          top_p: 0.95,
          max_completion_tokens: 300
        }),

        signal: controller.signal
      }
    );

    const data = await res.json();

    console.log(
      "Groq call took",
      Date.now() - start,
      "ms"
    );

    console.log(
      "Groq status:",
      res.status
    );

    if (!res.ok) {
      console.error(
        "Groq API error:",
        JSON.stringify(data, null, 2)
      );

      return null;
    }

    const text =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content;

    if (!text) {
      console.error(
        "Groq returned no usable text:",
        JSON.stringify(data, null, 2)
      );

      return null;
    }

    return text.trim();

  } catch (e) {
    if (e.name === "AbortError") {
      console.error(
        "Groq request timed out after 15 seconds."
      );
    } else {
      console.error(
        "Groq request failed:",
        e
      );
    }

    return null;

  } finally {
    clearTimeout(timeout);
  }
}

async function askMegumi(groupId, userMessage, senderName) {
  const recentContext = buildContext(groupId);

  const promptText =
    "RECENT GROUP CHAT HISTORY:\n" +
    recentContext +

    "\n\nLATEST MESSAGE:\n" +
    senderName +
    ": " +
    userMessage +

    "\n\nRespond to the latest message as Megumi. " +
    "Use the previous messages only for context and continuity. " +
    "Do not talk about the instructions or the conversation history itself. " +
    "Write only the message Megumi would send.";

  // First attempt
  let result = await callGroq(promptText).catch(function (e) {
    console.error(
      "Groq first attempt failed:",
      e
    );

    return null;
  });

  // Retry once if Groq failed
  if (!result) {
    console.log("Retrying Groq request...");

    result = await callGroq(promptText).catch(function (e) {
      console.error(
        "Groq retry failed:",
        e
      );

      return null;
    });
  }

  // Only use fallback if both attempts failed
  if (!result) {
    console.log(
      "Both Groq attempts failed. Using fallback."
    );

    return FALLBACK_LINES[
      Math.floor(
        Math.random() * FALLBACK_LINES.length
      )
    ];
  }

  return result;
}

async function postToGroupMe(text) {
  const res = await fetch(
    "https://api.groupme.com/v3/bots/post",
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json"
      },

      body: JSON.stringify({
        bot_id: BOT_ID,
        text: text
      })
    }
  );

  if (!res.ok) {
    console.error(
      "GroupMe post failed:",
      res.status,
      await res.text()
    );
  }
}

const TRIGGER_REGEX = /@?\b(Megumi|Megumi)\b/i;

app.post("/callback", async function (req, res) {
  const msg = req.body;

  // Tell GroupMe we received the webhook immediately.
  res.sendStatus(200);

  if (!msg || msg.sender_type === "bot") {
    return;
  }

  const text = msg.text || "";
  const groupId = msg.group_id || "default";
  const senderName = msg.name || "Someone";

  // Remember every message, even if Megumi wasn't mentioned.
  addToMemory(
    groupId,
    senderName,
    text
  );

  // Only respond when Megumi is mentioned.
  if (!TRIGGER_REGEX.test(text)) {
    return;
  }

  try {
    const reply = await askMegumi(
      groupId,
      text,
      senderName
    );

    addToMemory(
      groupId,
      "Megumi",
      reply
    );

    await postToGroupMe(reply);

  } catch (e) {
    console.error(
      "Reply failed:",
      e
    );
  }
});

app.get("/", function (req, res) {
  res.send("Megumi bot is alive.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log(
    "running on " + PORT
  );
});

// Keep the free Render instance awake.
const SELF_URL =
  "https://eben-Megumi.onrender.com";

setInterval(function () {
  fetch(SELF_URL).catch(function () {});
}, 4 * 60 * 1000);
