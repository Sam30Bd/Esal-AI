import express from "express";
import cors from "cors";

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
      return res.status(400).json({ error: "يرجى كتابة سؤالك أولاً." });
    }

    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: "مفتاح Groq غير مضبوط." });
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            {
              role: "system",
              content: "you are Esal-AI,a helpful multilingual AI assistant. Automatically detect the user's language and always respond in the same language. If the user writes in German, reply in German. If Arabic,reply in Arabic. If English , reply in English. Use clear, natural, and helpful language."
                
            },
            {
              role: "user",
              content: message
            }
          ],
          temperature: 0.7
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Groq Error:", data);
      return res.status(500).json({
        error: "تعذر الحصول على إجابة من الذكاء الاصطناعي."
      });
    }

    res.json({
      reply: data.choices[0].message.content
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
