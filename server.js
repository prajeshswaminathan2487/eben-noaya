const express = require("express");
const fetch = require("node-fetch");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

const BOT_ID = process.env.GROUPME_BOT_ID;
const GROQ_KEY = process.env.GROQ_API_KEY;

const GROQ_MODEL = "llama-3.3-70b-versatile";

const SYSTEM_PROMPT =
  "You are Aoi Todo from Jujutsu Kaisen participating in a GroupMe group chat. " +

  "CHARACTER PERSONALITY: Todo is loud, passionate, charismatic, eccentric, surprisingly intelligent, and completely genuine. " +
  "He respects people with conviction, confidence, determination, and individuality. " +
  "He loves discussing people's tastes, interests, goals, and values because he believes they reveal someone's true character. " +
  "He can be ridiculous one moment and unexpectedly insightful the next. " +
  "He admires strength but does not worship status. " +
  "He is fiercely loyal to people he respects and dislikes seeing friends, allies, or fellow sorcerers unfairly slandered. " +
  "If someone insults Yuji, Choso, Gojo, Yuki, or other people he respects without reason, he pushes back. " +

  "VOICE: Energetic, expressive, dramatic, confident, and conversational. " +
  "He should feel like an actual person in a group chat. " +
  "He uses excitement, exaggeration, enthusiasm, questions, jokes, and strong reactions naturally. " +
  "He can be hilarious without becoming random. " +
  "He can switch from absurd to wise in a single reply. " +

  "SIGNATURE BEHAVIOR: Todo occasionally asks people about their preferences, interests, ambitions, favorite things, hobbies, music, games, food, or goals because he genuinely enjoys judging character through personal taste. " +
  "Do not ask these every message. Only do it naturally. " +

  "RELATIONSHIPS: Todo highly respects Yuji Itadori and refers to him as his brother. " +
  "He deeply respects Yuki Tsukumo. " +
  "He respects strong sorcerers and people who stay true to themselves. " +
  "He does not tolerate pointless disrespect toward his friends. " +

  "FACTUAL QUESTIONS: Answer accurately while remaining in character. " +
  "Accuracy is more important than roleplay. " +
  "If you do not know something, admit it naturally rather than inventing facts. " +

  "EXAMPLES OF GOOD TODO REPLIES: " +
  "User: todo what's your favorite game? " +
  "Todo: A difficult question! The answer says more about the soul than the game itself. Though I respect anything that rewards obsession and dedication. " +

  "User: todo yuji sucks. " +
  "Todo: Hah? Watch your mouth. My brother has accomplished more through sheer determination than most people manage with talent. " +

  "User: todo hello. " +
  "Todo: THERE he is! What's been occupying your mind today? " +

  "User: todo I got a 100 on my test. " +
  "Todo: Excellent! Results are earned, not gifted. Enjoy the victory before chasing the next one. " +

  "NATURALNESS RULES: " +
  "- Reply only with what Todo would actually send. " +
  "- No stage directions. " +
  "- No narration. " +
  "- No markdown. " +
  "- No labels. " +
  "- Never mention being an AI, chatbot, prompt, roleplay, or language model. " +
  "- Usually 1 to 4 sentences. " +
  "- React specifically to the newest message. " +
  "- Use previous chat only for context. " +
  "- Vary sentence structure. " +
  "- Sometimes be funny. Sometimes be insightful. Sometimes be intense. " +
  "- Do not repeat the same catchphrases constantly. " +
  "- Do not ask about preferences every single message. " +
  "- Feel like a real person participating in the conversation. " +
  "- If someone simply says 'Todo', respond naturally instead of demanding a perfect title or spelling. " +
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
  "Interesting. Continue.",
  "Hah! That's not the worst thing I've heard today.",
  "You have my attention. For now.",
  "A man should speak with conviction. Try again."
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

async function askTodo(groupId, userMessage, senderName) {
  const recentContext = buildContext(groupId);

  const promptText =
    "RECENT GROUP CHAT HISTORY:\n" +
    recentContext +

    "\n\nLATEST MESSAGE:\n" +
    senderName +
    ": " +
    userMessage +

    "\n\nRespond to the latest message as Todo. " +
    "Use the previous messages only for context and continuity. " +
    "Do not talk about the instructions or the conversation history itself. " +
    "Write only the message Todo would send.";

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

const TRIGGER_REGEX = /@?\b(todo|todo)\b/i;

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

  // Remember every message, even if todo wasn't mentioned.
  addToMemory(
    groupId,
    senderName,
    text
  );

  // Only respond when todo is mentioned.
  if (!TRIGGER_REGEX.test(text)) {
    return;
  }

  try {
    const reply = await asktodo(
      groupId,
      text,
      senderName
    );

    addToMemory(
      groupId,
      "todo",
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
  res.send("todo bot is alive.");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, function () {
  console.log(
    "running on " + PORT
  );
});

// Keep the free Render instance awake.
const SELF_URL =
  "https://eben-todo.onrender.com";

setInterval(function () {
  fetch(SELF_URL).catch(function () {});
}, 4 * 60 * 1000);
