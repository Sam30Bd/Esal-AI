
import express from "express";
import cors from "cors";
import multer from "multer";

const app = express();

// =====================================
// 1. إعدادات الخادم
// =====================================

const PORT = process.env.PORT || 3000;

const MODEL =
  process.env.GROQ_MODEL || "openai/gpt-oss-120b";

const GROQ_API_KEY = process.env.GROQ_API_KEY;

const GROQ_BASE_URL =
  "https://api.groq.com/openai/v1";

const MAX_MESSAGE_LENGTH = 30000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(express.json({
  limit: "2mb"
}));

// =====================================
// 2. إعدادات CORS
// =====================================

const allowedOrigins = (
  process.env.ALLOWED_ORIGINS || "*"
)
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (
      !origin ||
      allowedOrigins.includes("*") ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// =====================================
// 3. تحديد معدل الطلبات
// =====================================

const requestCounts = new Map();

function rateLimit(options = {}) {
  const windowMs = options.windowMs || 60000;
  const max = options.max || 30;

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

    res.setHeader("RateLimit-Limit", max);
    res.setHeader(
      "RateLimit-Remaining",
      Math.max(0, max - record.count)
    );

    if (record.count > max) {
      return res.status(429).json({
        success: false,
        error: "طلبات كثيرة جداً. انتظر قليلاً ثم حاول مجدداً."
      });
    }

    next();
  };
}

// تنظيف بيانات تحديد الطلبات القديمة
setInterval(() => {
  const now = Date.now();

  for (const [ip, record] of requestCounts) {
    if (now - record.start > 120000) {
      requestCounts.delete(ip);
    }
  }
}, 120000).unref();

// =====================================
// 4. إعداد رفع الملفات الصوتية
// =====================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AUDIO_SIZE,
    files: 1
  },
  fileFilter(req, file, callback) {
    const allowedTypes = [
      "audio/webm",
      "audio/wav",
      "audio/mpeg",
      "audio/mp3",
      "audio/mp4",
      "audio/m4a",
      "audio/ogg",
      "audio/x-wav",
      "video/webm"
    ];

    if (
      allowedTypes.includes(file.mimetype) ||
      file.mimetype.startsWith("audio/")
    ) {
      return callback(null, true);
    }

    callback(new Error("نوع الملف الصوتي غير مدعوم."));
  }
});

// =====================================
// 5. تعليمات الذكاء الاصطناعي
// =====================================

const SYSTEM_PROMPT = `
أنت إسال AI، مساعد ذكاء اصطناعي احترافي ومتعدد اللغات.

مهمتك تقديم إجابات دقيقة ومفيدة وطبيعية ومنظمة.

اللغة:
- اكتشف لغة المستخدم تلقائياً.
- أجب باللغة نفسها التي يستخدمها.
- إذا تحدث بالعربية فأجب بالعربية.
- إذا تحدث بالألمانية فأجب بالألمانية.
- إذا تحدث بالإنجليزية فأجب بالإنجليزية.
- ادعم اللغات الأخرى حسب طلب المستخدم.
- لا تخلط اللغات دون حاجة.

المحادثة:
- افهم سياق المحادثة والرسائل السابقة.
- أجب عن الأسئلة المتتابعة بالاعتماد على السياق المتاح.
- لا تطلب معلومات سبق أن قدمها المستخدم.
- لا تدّعِ تذكر معلومات غير موجودة في المحادثة.

جودة الإجابات:
- قدم إجابات واضحة ومفيدة ومتكاملة.
- استخدم العناوين والقوائم عند الحاجة.
- اشرح الموضوعات الصعبة بطريقة سهلة.
- لا تكرر الكلام دون داعٍ.
- لا تخترع معلومات أو مصادر.
- وضح عدم اليقين عند الحاجة.

الترجمة:
- ترجم النصوص ترجمة احترافية وطبيعية.
- حافظ على المعنى والتفاصيل والتنسيق.
- لا تختصر الترجمة الكاملة.
- حافظ على الأسماء والأرقام والتواريخ.
- لا تضف تفسيرات غير مطلوبة.

الكتابة:
- اكتب المقالات والرسائل والمحتوى باحتراف.
- راعِ أسلوب الكتابة والجمهور المستهدف.
- حسّن الصياغة مع الحفاظ على المعنى عند التحرير.

التعليم:
- اشرح الدروس خطوة بخطوة.
- قدم أمثلة عملية.
- ساعد في الرياضيات والعلوم واللغات.
- وضح خطوات الحل ولا تكتفِ بالنتيجة عند طلب الشرح.

البرمجة:
- اكتب أكواداً واضحة ومنظمة.
- اشرح طريقة الاستخدام.
- انتبه للأمان والأخطاء.
- لا تدّعِ اختبار كود لم تختبره.

التلخيص:
- استخرج الأفكار الأساسية.
- احتفظ بالمعلومات المهمة.
- لا تغير المعنى الأصلي.

قواعد عامة:
- احترم تعليمات المستخدم.
- لا تكشف مفاتيح API أو الأسرار.
- لا تدّعِ تنفيذ عمليات لم تنفذها.
- كن مهذباً وطبيعياً واحترافياً.

أنت إسال AI، وهدفك تقديم تجربة ذكاء اصطناعي ممتازة.
`;

// =====================================
// 6. أدوات مساعدة
// =====================================

function requireApiKey(res) {
  if (!GROQ_API_KEY) {
    res.status(500).json({
      success: false,
      error: "مفتاح Groq API غير مضبوط على الخادم."
    });

    return false;
  }

  return true;
}

function cleanSpeechText(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/[#*_~>|]/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getErrorMessage(error) {
  if (error.name === "TimeoutError" ||
      error.name === "AbortError") {
    return "انتهت مهلة الطلب. حاول مرة أخرى.";
  }

  return "حدث خطأ أثناء معالجة طلبك. حاول لاحقاً.";
}

async function groqRequest(endpoint, options = {}) {
  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    options.timeout || 60000
  );

  try {
    const response = await fetch(
      GROQ_BASE_URL + endpoint,
      {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          ...(options.headers || {})
        }
      }
    );

    return response;

  } finally {
    clearTimeout(timeout);
  }
}

// =====================================
// 7. الصفحة الرئيسية وحالة الخادم
// =====================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    name: "Esal-AI",
    status: "online",
    model: MODEL,
    version: "2.0",
    message: "إسال AI جاهز لمساعدتك."
  });
});

// فحص صحة الخادم
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "Esal-AI",
    timestamp: new Date().toISOString()
  });
});

// =====================================
// 8. المحادثة الذكية
// =====================================

app.post(
  "/api/chat",
  rateLimit({
    windowMs: 60000,
    max: 20
  }),
  async (req, res) => {
    try {
      if (!requireApiKey(res)) return;

      const {
        message,
        history = []
      } = req.body || {};

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
          error: "الرسالة طويلة جداً. يرجى تقسيم النص."
        });
      }

      if (!Array.isArray(history)) {
        return res.status(400).json({
          success: false,
          error: "سجل المحادثة غير صالح."
        });
      }

      // التحقق من سجل المحادثة
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
          content: SYSTEM_PROMPT
        },
        ...safeHistory,
        {
          role: "user",
          content: message.trim()
        }
      ];

      const response = await groqRequest(
        "/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: MODEL,
            messages,
            temperature: 0.5,
            max_completion_tokens: 4096
          }),
          timeout: 60000
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Groq Chat Error:", data);

        return res.status(502).json({
          success: false,
          error: "تعذر الحصول على إجابة حالياً. حاول مجدداً."
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
// 9. تحويل الصوت إلى نص
// =====================================

app.post(
  "/api/transcribe",
  rateLimit({
    windowMs: 60000,
    max: 10
  }),
  upload.single("audio"),
  async (req, res) => {
    try {
      if (!requireApiKey(res)) return;

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "لم يتم إرسال تسجيل صوتي."
        });
      }

      const form = new FormData();

      const audioBlob = new Blob(
        [req.file.buffer],
        {
          type: req.file.mimetype || "audio/webm"
        }
      );

      form.append(
        "file",
        audioBlob,
        req.file.originalname || "recording.webm"
      );

      form.append(
        "model",
        "whisper-large-v3-turbo"
      );

      form.append("response_format", "json");

      const response = await groqRequest(
        "/audio/transcriptions",
        {
          method: "POST",
          body: form,
          timeout: 90000
        }
      );

      const data = await response.json();

      if (!response.ok) {
        console.error("Transcription Error:", data);

        return res.status(502).json({
          success: false,
          error: "تعذر تحويل الصوت إلى نص."
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
// 10. تحويل النص إلى صوت
// =====================================

app.post(
  "/api/speech",
  rateLimit({
    windowMs: 60000,
    max: 30
  }),
  async (req, res) => {
    try {
      if (!requireApiKey(res)) return;

      const {
        text,
        language = "ar"
      } = req.body || {};

      if (
        typeof text !== "string" ||
        !text.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "يرجى إرسال النص المراد قراءته."
        });
      }

      if (text.length > 200) {
        return res.status(400).json({
          success: false,
          error: "النص طويل جداً. قسّمه إلى مقاطع قصيرة."
        });
      }

      if (!["ar", "en"].includes(language)) {
        return res.status(400).json({
          success: false,
          error: "اللغة الصوتية غير مدعومة حالياً."
        });
      }

      // تنظيف النص من الرموز وعلامات الترقيم
      const cleanText = cleanSpeechText(text);

      if (!cleanText) {
        return res.status(400).json({
          success: false,
          error: "لا توجد كلمات أو أرقام لقراءتها."
        });
      }

      // اختيار نموذج الصوت حسب اللغة
      const model = language === "ar"
        ? "canopylabs/orpheus-arabic-saudi"
        : "canopylabs/orpheus-v1-english";

      const voice = language === "ar"
        ? "fahad"
        : "troy";

      const response = await groqRequest(
        "/audio/speech",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model,
            input: cleanText,
            voice,
            response_format: "wav"
          }),
          timeout: 60000
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "Speech Provider Error:",
          errorText
        );

        return res.status(502).json({
          success: false,
          error: "تعذر إنشاء الصوت حالياً."
        });
      }

      const audioBuffer = Buffer.from(
        await response.arrayBuffer()
      );

      res.setHeader(
        "Content-Type",
        "audio/wav"
      );

      res.setHeader(
        "Content-Length",
        audioBuffer.length
      );

      res.setHeader(
        "Cache-Control",
        "no-store"
      );

      return res.send(audioBuffer);

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
// 11. معالجة الملفات والأخطاء
// =====================================

app.use((err, req, res, next) => {
  console.error("Server Middleware Error:", err);

  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        success: false,
        error: "حجم التسجيل أكبر من الحد المسموح."
      });
    }

    return res.status(400).json({
      success: false,
      error: "حدث خطأ أثناء رفع الملف الصوتي."
    });
  }

  if (err.message === "Origin not allowed") {
    return res.status(403).json({
      success: false,
      error: "هذا المصدر غير مسموح له بالاتصال بالخادم."
    });
  }

  return res.status(500).json({
    success: false,
    error: "حدث خطأ داخلي في الخادم."
  });
});

// =====================================
// 12. تشغيل الخادم
// =====================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("================================");
  console.log("       ESAL AI SERVER");
  console.log("================================");
  console.log("Status: Online");
  console.log("Port:", PORT);
  console.log("Model:", MODEL);
  console.log("Groq API:", GROQ_API_KEY ? "Configured" : "Missing");
  console.log("Version: 2.0");
  console.log("================================");
});

