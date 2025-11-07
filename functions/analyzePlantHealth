import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import OpenAI from 'npm:openai@4.73.1';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    console.log('🏥 analyzePlantHealth function called');
    
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            console.error('❌ No user authenticated');
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { image_url, plant_name } = await req.json();
        
        if (!image_url) {
            console.error('❌ No image URL provided');
            return Response.json({ error: 'Image URL is required' }, { status: 400 });
        }

        console.log('📸 Analyzing health for:', plant_name);
        console.log('📸 Image URL:', image_url);

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `You are a plant health expert. Analyze the plant image and provide a health assessment.

Focus on:
- Overall health status (healthy, needs attention, concerning)
- Watering issues (overwatered, underwatered, just right)
- Light issues (too much sun, not enough light, good lighting)
- Leaf condition (yellowing, browning, spots, pests)
- Any visible problems or diseases
- Specific recommendations for improvement

Be friendly and encouraging. If the plant looks healthy, celebrate that! If there are issues, provide clear, actionable advice.

Keep your response to 3-4 short paragraphs max.`
                },
                {
                    role: "user",
                    content: [
                        {
                            type: "image_url",
                            image_url: { url: image_url }
                        },
                        {
                            type: "text",
                            text: `Please analyze the health of this ${plant_name || 'plant'} and provide specific care recommendations.`
                        }
                    ]
                }
            ],
            max_tokens: 500
        });

        console.log('✅ Health analysis complete');
        const analysis = response.choices[0].message.content;

        return Response.json({ 
            success: true, 
            analysis 
        });
    } catch (error) {
        console.error('❌ Error in analyzePlantHealth:', error);
        return Response.json({ 
            success: false,
            error: error.message || 'Failed to analyze plant health'
        }, { status: 500 });
    }
});