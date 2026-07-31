// api/scan-sheet.js
// دالة Vercel لاستخراج بيانات الجدول من صورة باستخدام Claude
// تستقبل صورة الجدول (base64) وترسلها لـ Claude لتستخرج منها البيانات
// وترجعها بصيغة JSON جاهزة لتعبئة جدول SOS في التطبيق

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageBase64, mediaType, categories } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "لم يتم إرسال صورة" });
    }

    // نبني وصف الأعمدة المطلوبة من بيانات SOS الحالية في التطبيق
    // (categories: [{ name, columns: [{ id, label }] }])
    const columnsDescription = (categories || [])
      .map(cat => {
        const cols = (cat.columns || []).map(c => `"${c.id}" (${c.label})`).join(", ");
        return `- منتج "${cat.name}": الأعمدة ${cols}`;
      })
      .join("\n");

    const systemPrompt = `أنت مساعد لاستخراج بيانات من صورة جدول SOS (توزيع منتجات على فروع).
استخرج من الصورة صفوف الفروع بالأعمدة التالية لكل منتج:
${columnsDescription}

أعد النتيجة بصيغة JSON فقط بدون أي نص إضافي، بهذا الشكل بالضبط:
{
  "branches": [
    { "merch": "", "sap": "", "name": "اسم الفرع", "values": { "colId1": "قيمة", "colId2": "قيمة" } }
  ]
}
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
