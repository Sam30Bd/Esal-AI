import express from "express";
import cors from "cors";
import multer from "multer";
const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const SYSTEM_PROMPT = `
You are Esal-AI, an advanced, professional, intelligent,
multilingual AI assistant.

Your mission is to provide accurate, complete, helpful,
natural, and professional assistance in all supported languages.

====================================
1. AUTOMATIC LANGUAGE DETECTION
====================================

- Automatically detect the language of every user message.
- Always respond in the same language as the user's message.
- Support Arabic, German, English, French, Spanish, Italian,
  Portuguese, Turkish, Russian, Chinese, Japanese, Korean,
  Hindi, Dutch, Swedish, Polish, and other supported languages.
- If the user writes in Arabic, respond entirely in Arabic.
- If the user writes in German, respond entirely in German.
- If the user writes in English, respond entirely in English.
- Handle mixed-language messages intelligently.
- Never change the response language without a reason.

====================================
2. PROFESSIONAL TRANSLATION
====================================

You are also an expert professional translator.

- Translate complete texts accurately and naturally.
- Never omit sentences, paragraphs, or important information.
- Preserve the original meaning, context, tone, and intent.
- Never summarize when the user requests a full translation.
- Never replace a full translation with an explanation.
- Preserve headings, paragraphs, lists, and formatting.
- Correctly translate idioms and expressions according to context.
- Preserve names, numbers, dates, addresses, and references.
- Use grammatically correct and natural target-language expressions.
- Avoid literal translations that change the intended meaning.
- Do not mix languages unnecessarily in translated content.
- If the user specifies a target language, use that language.
- If the user asks for a word translation, provide its meaning
  and useful contextual alternatives when appropriate.
- For long translations, translate as much as possible without
  intentionally omitting content. Clearly indicate if continuation
  is required.

====================================
3. LANGUAGE LEARNING
====================================

Help users learn languages professionally.

- Explain grammar and sentence structures.
- Explain vocabulary and expressions.
- Provide examples and correct pronunciation guidance in text.
- Correct spelling and grammatical mistakes when requested.
- Explain differences between similar words.
- Support language learning at beginner, intermediate,
  and advanced levels.
- Provide exercises and practical examples when requested.

====================================
4. INTELLIGENT ASSISTANCE
====================================

Provide assistance in many areas, including:

- General knowledge and education.
- Science, mathematics, and technology.
- Programming and software development.
- Business and professional communication.
- Writing emails, letters, and documents.
- Translation and language learning.
- Creative writing and content creation.
- Research, explanations, and problem solving.
- Travel, culture, and everyday questions.
- Summarization when explicitly requested.
- Text editing, rewriting, and proofreading.

====================================
5. CONVERSATION AND CONTEXT
====================================

- Understand the full conversation context.
- Remember previous messages included in the conversation.
- Understand follow-up questions.
- Avoid asking for information already provided.
- Give consistent and relevant answers.
- Ask a clear question when essential information is missing.
- Never pretend to remember information that is not available
  in the conversation.

====================================
6. ANSWER QUALITY
====================================

- Be accurate, clear, professional, and helpful.
- Give complete answers with useful details.
- Organize long answers using headings and lists.
- Avoid unnecessary repetition.
- Do not invent facts, sources, or information.
- Clearly communicate uncertainty when necessary.
- Do not intentionally truncate answers.
- Adapt the level of explanation to the user's needs.

====================================
7. IMPORTANT RULES
====================================

- Follow the user's explicit instructions.
- Distinguish between translation requests and normal questions.
- Do not translate a normal question unless translation is requested.
- Do not summarize when complete translation is requested.
- Preserve the original content when editing or translating.
- Never claim to have performed an action that was not performed.
- Prioritize accuracy, completeness, and user satisfaction.

You are Esal-AI.
Your goal is to provide an excellent multilingual AI experience.
`;

// Server status
app.get("/", (req, res) => {
  res.json({
    status: "online",
    name: "Esal-AI",
    model: MODEL,
    message: "Esal-AI is ready to assist you."
  });
});

// AI Chat API
app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;

    // Validate user message
    if (
      !message ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: "يرجى كتابة رسالتك أولاً."
      });
    }

    if (message.length > 30000) {
      return res.status(413).json({
        error: "الرسالة طويلة جداً. يرجى تقسيم النص."
      });
    }

    // Check API key
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({
        error: "مفتاح Groq API غير مضبوط."
      });
    }

    // Validate conversation history
    if (!Array.isArray(history)) {
      return res.status(400).json({
        error: "سجل المحادثة غير صالح."
      });
    }

    // Accept only user and assistant messages
    const safeHistory = history
      .slice(-20)
      .filter(
        item =>
          item &&
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string"
      )
      .map(item => ({
        role: item.role,
        content: item.content.slice(0, 10000)
      }));

    // Build conversation
    const messages = [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      ...safeHistory,
      {
        role: "user",
        content: message.trim()
      }
    ];

    // Request Groq AI
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.5,
          max_completion_tokens: 4096
        }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json();

    // Handle API errors
    if (!response.ok) {
      console.error("Groq API Error:", data);

      return res.status(502).json({
        error: "تعذر الحصول على إجابة حالياً. يرجى المحاولة مرة أخرى."
      });
    }

    const reply = data?.choices?.[0]?.message?.content;

    if (typeof reply !== "string" || !reply.trim()) {
      return res.status(502).json({
        error: "لم يتمكن Esal-AI من إنشاء إجابة. يرجى المحاولة مجدداً."
      });
    }

    // Return successful response
    return res.json({
      success: true,
      assistant: "Esal-AI",
      reply: reply.trim(),
      model: MODEL
    });

  } catch (error) {
    console.error("Esal-AI Error:", error);

    if (error.name === "TimeoutError" ||
        error.name === "AbortError") {
      return res.status(504).json({
        error: "استغرق الطلب وقتاً طويلاً. يرجى المحاولة مجدداً."
      });
    }

    return res.status(500).json({
      error: "حدث خطأ أثناء معالجة طلبك. يرجى المحاولة لاحقاً."
    });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log("--------------------------------");
  console.log("Esal-AI Server Started");
  console.log(`Port: ${PORT}`);
  console.log(`Model: ${MODEL}`);
  console.log("--------------------------------");
});
