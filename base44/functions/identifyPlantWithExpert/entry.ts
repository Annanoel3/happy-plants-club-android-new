import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { image_url } = await req.json();

        if (!image_url) {
            return Response.json({ error: 'No image_url provided' }, { status: 400 });
        }

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: image_url }
                        },
                        {
                            type: "text",
                            text: `Identify this plant and provide comprehensive care information. Return ONLY a JSON object in this exact format:
{
  "name": "common name",
  "scientific_name": "scientific name",
  "care_instructions": {
    "watering": "detailed watering instructions",
    "sunlight": "sunlight requirements",
    "soil": "soil preferences",
    "humidity": "humidity needs",
    "temperature": "temperature range",
    "fertilizing": "fertilizing schedule",
    "tips": "care tips and warnings"
  },
  "water_frequency_days": number
}`
                        }
                    ]
                }
            ],
            response_format: { type: "json_object" },
            max_tokens: 1000
        });

        let plantData;
        try {
            plantData = JSON.parse(response.choices[0].message.content);
        } catch (e) {
            return Response.json({ success: false, error: 'Could not parse plant data' }, { status: 400 });
        }

        return Response.json({ success: true, plantData });
    } catch (error) {
        console.error('Error in identifyPlantWithExpert:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
});