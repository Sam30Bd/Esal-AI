import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Esal-AI Server is running!");
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "يرجى كتابة سؤالك أولاً."
      });
    }

    if (message.length > 5000) {
      return res.status(400).json({
        error: "الرسالة طويلة جداً."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "مفتاح الذكاء الاصطناعي غير مضبوط."
      });
    }

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const response = await client.responses.create({
      model: "gpt-5.5",
      instructions: "أنت Esal-AI، مساعد ذكي يتحدث العربية والإنجليزية. أجب بوضوح وبأسلوب مفيد.",
      input: message
    });

    res.json({
      reply: response.output_text
    });

  } catch (error) {
    console.error("Esal-AI Error:", error);

    res.status(500).json({
      error: "حدث خطأ أثناء معالجة سؤالك."
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Esal-AI running on port ${PORT}`);
});
