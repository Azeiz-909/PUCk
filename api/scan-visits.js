// api/scan-visits.js
// دالة Vercel لاستخراج بيانات جدول الزيارات (الفروع) من صورة باستخدام Claude
// تستقبل صورة الجدول (base64) وأسماء الخانات (fields) وترسلها لـ Claude لتستخرج البيانات
// وترجعها بصيغة JSON جاهزة لتعبئة بطاقات الفروع في جدول الزيارات

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mediaType, fields } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "لم يتم إرسال صورة" });
    }

    // fields: [{ id, label, prominent }]
    const fieldsDescription = (fields || [])
      .map(f => `- "${f.id}" (${f.label})${f.prominent ? " — الحقل الأساسي/اسم العميل" : ""}`)
      .join("\n");

    const systemPrompt = `أنت مساعد لاستخراج بيانات من صورة جدول زيارات فروع/عملاء.
كل صف في الجدول يمثل فرعًا/عميلاً واحدًا. استخرج لكل صف قيم الخانات التالية إن وجدت في الصورة:
${fieldsDescription}
وأيضًا رقم الهدف الأسبوعي للزيارات إن وُجد عمود بهذا المعنى (weeklyTarget، كرقم صحيح).

أعد النتيجة بصيغة JSON فقط بدون أي نص إضافي، بهذا الشكل بالضبط:
{
  "accounts": [
    { "values": { "fieldId1": "قيمة", "fieldId2": "قيمة" }, "weeklyTarget": 0 }
  ]
}
استخدم بالضبط نفس معرّفات الخانات (fieldId) المذكورة أعلاه كمفاتيح داخل values.
لا تكتب أي شرح، فقط JSON صالح.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64
                }
              },
              { type: "text", text: "استخرج بيانات الجدول من هذه الصورة وأعدها بصيغة JSON كما هو مطلوب." }
            ]
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    const textBlock = data.content?.find(c => c.type === "text");
    let extracted;
    try {
      const cleaned = (textBlock?.text || "").replace(/```json|```/g, "").trim();
      extracted = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(500).json({ error: "تعذر تحليل رد الذكاء الاصطناعي", raw: textBlock?.text });
    }

    return res.status(200).json(extracted);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
