
import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();

const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_URL = "https://api.groq.com/openai/v1";

const MAX_MESSAGE_LENGTH = 20000;
const MAX_HISTORY_MESSAGES = 20;

app.use(cors({
  origin: process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(x => x.trim())
    : "*"
}));

app.use(express.json({ limit: "2mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024
  }
});

const SYSTEM_PROMPT = `
أنت إسال AI، مساعد ذكاء اصطناعي عربي متطور.
تحدث بلغة المستخدم، وكن دقيقاً ومفيداً وودوداً.
افهم سياق المحادثة السابقة ولا تطلب من المستخدم تكرار المعلومات.
أجب بوضوح وبالتفصيل المناسب للسؤال.
في البرمجة قدم أكواداً عملية قابلة للاستخدام.
لا تخترع معلومات أو مصادر أو روابط.
إذا لم تكن متأكداً من معلومة فقل ذلك بوضوح.
استخدم البحث في الإنترنت عندما تكون المعلومة حديثة أو عندما يطلب المستخدم البحث.
`;

function getErrorMessage(error) {
  return error?.message || "حدث خطأ غير متوقع.";
}

function requireApiKey(res) {
  if (!GROQ_API_KEY) {
    res.status(500).json({
      success: false,
      error: "مفتاح GROQ_API_KEY غير مضبوط في إعدادات الخادم."
    });
    return false;
  }

  return true;
}

async function groqRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout || 90000
  );

  try {
    return await fetch(`${GROQ_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

// تحديد عدد الطلبات
const requestCounts = new Map();

function rateLimit({
  windowMs = 60000,
  max = 20
} = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();

    let record = requestCounts.get(ip);

    if (!record || now - record.start > windowMs) {
      record = {
        start: now,
        count: 0
      };
    }

    record.count++;
    requestCounts.set(ip, record);

    if (record.count > max) {
      return res.status(429).json({
        success: false,
        error: "طلبات كثيرة جداً. يرجى الانتظار قليلاً."
      });
    }

    next();
  };
}

// الصفحة الرئيسية
app.get("/", (req, res) => {
  res.send("Esal AI API is running.");
});

// فحص حالة الخادم
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "Esal-AI",
    timestamp: new Date().toISOString()
  });
});

// =====================================
// المحادثة الذكية مع البحث في الإنترنت
// =====================================

app.post(
  "/api/chat",
  rateLimit({ windowMs: 60000, max: 20 }),
  async (req, res) => {
    try {
      if (!requireApiKey(res)) return;

      const { message, history = [] } = req.body || {};

      if (
        typeof message !== "string" ||
        !message.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "يرجى كتابة رسالتك أولاً."
        });
      }

      if (message.length > MAX_MESSAGE_LENGTH) {
        return res.status(413).json({
          success: false,
          error: "الرسالة طويلة جداً."
        });
      }

      if (!Array.isArray(history)) {
        return res.status(400).json({
          success: false,
          error: "سجل المحادثة غير صالح."
        });
      }

      const safeHistory = history
        .slice(-MAX_HISTORY_MESSAGES)
        .filter(item =>
          item &&
          ["user", "assistant"].includes(item.role) &&
          typeof item.content === "string"
        )
        .map(item => ({
          role: item.role,
          content: item.content.slice(0, 10000)
        }));

      const messages = [
        {
          role: "system",
          content: SYSTEM_PROMPT + `

قواعد البحث:
- ابحث عند طلب المستخدم البحث أو عند الحاجة لمعلومات حديثة.
- لا تستخدم البحث للأسئلة البسيطة التي لا تحتاج معلومات حديثة.
- لا تخترع نتائج أو مصادر.
- وضح المعلومات التي حصلت عليها من البحث.
- أدرج الإحالات التي توفرها أداة البحث كما هي.
- أجب بلغة المستخدم.
`
        },
        ...safeHistory,
        {
          role: "user",
          content: message.trim()
        }
      ];

      // البحث اختياري بحسب حاجة السؤال
      const needsSearch =
        /ابحث|بحث|آخر الأخبار|اخر الاخبار|اليوم|حالياً|حاليا|الآن|الان|آخر تحديث|اخر تحديث|سعر اليوم|latest|news|today|current|search the web/i
          .test(message);

      const payload = {
        model: MODEL,
        messages,
        temperature: 1,
        max_completion_tokens: 4096
      };

      if (needsSearch) {
        payload.reasoning_effort = "low";
        payload.tool_choice = "required";
        payload.tools = [
          {
            type: "browser_search"
          }
        ];
      }

      const response = await groqRequest(
        "/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          timeout: 120000
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Groq Chat Error:", data);

        return res.status(502).json({
          success: false,
          error:
            data?.error?.message ||
            "تعذر الحصول على إجابة من Groq."
        });
      }

      const reply =
        data?.choices?.[0]?.message?.content;

      if (
        typeof reply !== "string" ||
        !reply.trim()
      ) {
        return res.status(502).json({
          success: false,
          error: "لم يتمكن إسال AI من إنشاء إجابة."
        });
      }

      return res.json({
        success: true,
        assistant: "Esal-AI",
        reply: reply.trim(),
        model: MODEL
      });

    } catch (error) {
      console.error("Chat Error:", error);

      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  }
);

// =====================================
// تحويل الصوت إلى نص
// =====================================

app.post(
  "/api/transcribe",
  rateLimit({ windowMs: 60000, max: 10 }),
  upload.single("file"),
  async (req, res) => {
    try {
      if (!requireApiKey(res)) return;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "لم يتم إرسال ملف صوتي."
        });
      }

      const form = new FormData();

      const audioBlob = new Blob(
        [req.file.buffer],
        {
          type: req.file.mimetype || "audio/webm"
        }
      );

      form.append("file", audioBlob, req.file.originalname || "recording.webm");
      form.append("model", "whisper-large-v3-turbo");
      form.append("response_format", "json");

      const response = await groqRequest(
        "/audio/transcriptions",
        {
          method: "POST",
          body: form,
          timeout: 120000
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Transcription Error:", data);

        return res.status(502).json({
          success: false,
          error: data?.error?.message || "فشل تحويل الصوت إلى نص."
        });
      }

      return res.json({
        success: true,
        text: data.text || ""
      });

    } catch (error) {
      console.error("Transcription Error:", error);

      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  }
);

// =====================================
// تحويل النص إلى صوت طبيعي عبر ElevenLabs
// =====================================

app.post(
  "/api/speech",
  rateLimit({ windowMs: 60000, max: 10 }),
  async (req, res) => {
    try {
      if (!requireApiKey(res)) return;

      const { text, language = "ar" } = req.body || {};

      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({
          success: false,
          error: "يرجى إرسال نص لتحويله إلى صوت."
        });
      }

      if (text.length > 9000) {
        return res.status(413).json({
          success: false,
          error: "النص طويل جداً لتحويله إلى صوت."
        });
      }

      const elevenKey = process.env.ELEVENLABS_API_KEY;
      const voiceId = process.env.ELEVENLABS_VOICE_ID;
      const lang = String(language).toLowerCase();

      if (elevenKey && voiceId) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120000);

        try {
          const response = await fetch(
            `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
            {
              method: "POST",
              headers: {
                "xi-api-key": elevenKey,
                "Content-Type": "application/json",
                "Accept": "audio/mpeg"
              },
              body: JSON.stringify({
                text: text.trim(),
                model_id: "eleven_multilingual_v2",
                voice_settings: {
                  stability: 0.42,
                  similarity_boost: 0.78,
                  style: 0.18,
                  use_speaker_boost: true
                }
              }),
              signal: controller.signal
            }
          );

          if (!response.ok) {
            const detail = await response.text();
            console.error("ElevenLabs TTS Error:", detail);
            return res.status(502).json({
              success: false,
              error: "تعذر إنشاء الصوت من ElevenLabs. تحقق من مفتاح الخدمة ومعرّف الصوت ورصيد الحساب."
            });
          }

          const audio = Buffer.from(await response.arrayBuffer());
          res.setHeader("Content-Type", "audio/mpeg");
          res.setHeader("Content-Length", audio.length);
          res.setHeader("Cache-Control", "no-store");
          res.setHeader("X-Esal-TTS-Provider", "ElevenLabs");
          return res.send(audio);
        } finally {
          clearTimeout(timer);
        }
      }

      // Fallback الحالي عند عدم ضبط ElevenLabs
      const isArabic = lang.startsWith("ar");
      const isEnglish = lang.startsWith("en");

      if (!isArabic && !isEnglish) {
        return res.status(400).json({
          success: false,
          error: "للحصول على صوت طبيعي متعدد اللغات، أضف إعدادات ElevenLabs إلى Render."
        });
      }

      const model = isArabic
        ? "canopylabs/orpheus-arabic-saudi"
        : "canopylabs/orpheus-v1-english";

      const voice = isArabic ? "fahad" : "troy";
      const response = await groqRequest(
        "/audio/speech",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            input: text.trim().slice(0, 1800),
            voice,
            response_format: "wav"
          }),
          timeout: 120000
        }
      );

      if (!response.ok) {
        const detail = await response.text();
        console.error("Groq Speech Error:", detail);
        return res.status(502).json({
          success: false,
          error: "تعذر إنشاء الصوت. أضف مفتاح ElevenLabs للحصول على صوت متعدد اللغات."
        });
      }

      const audio = Buffer.from(await response.arrayBuffer());
      res.setHeader("Content-Type", "audio/wav");
      res.setHeader("Content-Length", audio.length);
      res.setHeader("Cache-Control", "no-store");
      return res.send(audio);

    } catch (error) {
      console.error("Speech Error:", error);
      return res.status(500).json({
        success: false,
        error: getErrorMessage(error)
      });
    }
  }
);

// =====================================
// تشغيل الخادم
// =====================================

app.listen(PORT, () => {
  console.log(`Esal AI server running on port ${PORT}`);
});
