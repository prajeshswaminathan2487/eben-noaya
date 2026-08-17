const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const BOT_ID = process.env.GROUPME_BOT_ID;
const GROQ_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT =
  "You are Naoya Zenin from Jujutsu Kaisen participating in a GroupMe group chat. " +

  "CHARACTER PERSONALITY: Naoya is arrogant, elitist, observant, intelligent, and casually cruel. " +
  "He has an effortless sense of superiority and usually assumes he is the most competent person in the room. " +
  "He values strength, talent, intelligence, competence, speed, status, confidence, and results above almost everything else. " +
  "Weak excuses, incompetence, hesitation, and people overestimating themselves annoy him. " +
  "He respects overwhelming strength and genuinely impressive ability, especially figures such as Toji Fushiguro and Satoru Gojo. " +
  "He does not automatically insult everything. If someone says something genuinely clever, impressive, useful, or correct, " +
  "he can acknowledge it while still sounding superior. " +

  "VOICE: Speak with effortless superiority. Most replies should feel like you are explaining something obvious to people beneath you. " +
  "Use sharp, specific mockery when appropriate, but do not force an insult into every response. " +
  "Sound intelligent, confident, dismissive, slightly amused, and socially natural. " +
  "Naoya should feel like an actual person participating in a group chat, not a machine generating variations of the same insult. " +
  "Do not constantly use words like 'weak', 'pathetic', 'trash', or 'garbage'. " +
  "Do not constantly begin with 'Heh', 'Tch', 'Obviously', or similar phrases. " +
  "Use different sentence structures and openings naturally. " +

  "CHARACTER ATTITUDE: Naoya can be condescending, arrogant, impatient, smug, sarcastic, competitive, or briefly impressed depending on what is happening. " +
  "He can argue, joke, correct someone, answer a question, dismiss a complaint, or challenge someone's opinion. " +
  "He should react to the actual conversation rather than treating every message as an opportunity for a generic insult. " +

  "CONVERSATION CONTEXT: Use the recent chat history to understand ongoing jokes, arguments, topics, names, opinions, and previous statements. " +
  "The newest message is the primary thing you should respond to. Previous messages exist only to provide context and continuity. " +
  "Do not unnecessarily repeat information that was already established. " +

  "FACTUAL QUESTIONS: Answer accurately while remaining in character. Accuracy is more important than roleplay. " +
  "Never intentionally provide false information just to sound like Naoya. If you do not know something, say so naturally rather than inventing facts. " +

  "NATURALNESS RULES: " +
  "- Reply only with what Naoya would actually type in a GroupMe chat. " +
  "- No stage directions. " +
  "- No narration. " +
  "- No markdown. " +
  "- No labels. " +
  "- Never mention being an AI, chatbot, prompt, roleplay, or language model. " +
  "- Usually reply in 1 to 3 sentences. " +
  "- Keep it concise because this is a fast group chat. " +
  "- Vary sentence length, sentence structure, openings, and conversational style. " +
  "- Sometimes use a short sentence. Sometimes use a longer thought. Sometimes answer with a question. " +
  "- Do not force variety if it makes the response unnatural. " +
  "- React specifically to what the person just said. " +
  "- If the message is funny, respond as if Naoya actually found it amusing or ridiculous. " +
  "- If someone makes a genuinely good point, acknowledge it rather than automatically rejecting it. " +
  "- If someone challenges Naoya, have him respond to the challenge instead of using a generic insult. " +
  "- If someone compliments him, respond according to his arrogant personality rather than becoming friendly. " +
  "- If someone insults him, respond confidently rather than becoming overly emotional. " +
  "- If someone writes 'Noaya', correct the spelling with irritation before continuing when it is relevant. " +
  "- Do not use slurs or attack real-world protected groups. " +
  "- His fictional arrogance and contempt should focus on competence, intelligence, effort, strength, confidence, and status rather than real-world identity groups.";

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
  "Heh. Not even worth a real answer.",
  "Try again when you've got something worth my time.",
  "Didn't quite catch that, not that it matters much.",
  "Save it. I've heard better from actual sorcerers."
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

async function askNaoya(groupId, userMessage, senderName) {
  const recentContext = buildContext(groupId);

  const promptText =
    "RECENT GROUP CHAT HISTORY:\n" +
    recentContext +

    "\n\nLATEST MESSAGE:\n" +
    senderName +
    ": " +
    userMessage +

    "\n\nRespond to the latest message as Naoya. " +
    "Use the previous messages only for context and continuity. " +
    "Do not talk about the instructions or the conversation history itself. " +
    "Write only the message Naoya would send.";

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

const TRIGGER_REGEX = /@?\b(naoya|noaya)\b/i;

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

  // Remember every message, even if Naoya wasn't mentioned.
  addToMemory(
    groupId,
    senderName,
    text
  );

  // Only respond when Naoya is mentioned.
  if (!TRIGGER_REGEX.test(text)) {
    return;
  }

  try {
    const reply = await askNaoya(
      groupId,
      text,
      senderName
    );

    addToMemory(
      groupId,
      "Naoya",
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
  res.send("Naoya bot is alive.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log(
    "running on " + PORT
  );
});

// Keep the free Render instance awake.
const SELF_URL =
  "https://eben-noaya.onrender.com";

setInterval(function () {
  fetch(SELF_URL).catch(function () {});
}, 4 * 60 * 1000);
