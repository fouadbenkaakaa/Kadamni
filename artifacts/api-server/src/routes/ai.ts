import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireAuth);

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).optional(),
});

router.post("/ai/chat", async (req, res) => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "رسالة غير صالحة" });
    return;
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(503).json({ error: "المساعد الذكي غير مفعّل على الخادم. أضف OPENAI_API_KEY إلى Secrets في Replit." });
    return;
  }

  const messages = [
    { role: "system", content: "أنت المساعد الذكي الرسمي لتطبيق خدمني في الجزائر. ساعد المستخدم في البحث عن الوظائف والعمال والخدمات، كتابة السيرة الذاتية، اقتراح الأسعار، وصياغة الإعلانات. أجب بالعربية ما لم يطلب لغة أخرى. لا تدّعي أنك نفذت إجراءً داخل التطبيق ما لم يحدث فعلاً." },
    ...(parsed.data.history || []),
    { role: "user", content: parsed.data.message },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || "gpt-4o-mini", messages, temperature: 0.3 }),
  });
  const data = await response.json().catch(() => null) as any;
  if (!response.ok) {
    res.status(502).json({ error: data?.error?.message || "تعذر الاتصال بالمساعد الذكي" });
    return;
  }
  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) {
    res.status(502).json({ error: "لم يُرجع المساعد إجابة" });
    return;
  }
  res.json({ answer, model: data.model || process.env.OPENAI_MODEL || "gpt-4o-mini" });
});

export default router;
