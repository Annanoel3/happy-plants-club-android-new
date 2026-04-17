import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
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

        const { content } = await req.json();

        // Check for obvious bad words first (profanity only)
        const badWords = ['fuck', 'shit', 'bitch', 'ass', 'bastard', 'damn'];
        const lowerContent = content.toLowerCase();
        const hasBadWords = badWords.some(word => lowerContent.includes(word));

        if (hasBadWords) {
            return Response.json({ 
                appropriate: false, 
                reason: 'Contains inappropriate language' 
            });
        }

        // Use AI for more nuanced moderation
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are a content moderator for a plant care community. Determine if the content is appropriate.
                    
ONLY block content that is:
- Hateful, racist, sexist, or discriminatory
- Threatening or harassing
- Sexually explicit
- Promoting violence or illegal activities
- Spam or commercial advertising

ALLOW all other content, including:
- Any plant-related content
- Personal stories and off-topic friendly chat
- Questions and discussions
- Constructive criticism
- General conversation between plant lovers

Return ONLY valid JSON: {"appropriate": true/false, "reason": "explanation if not appropriate"}`
                },
                {
                    role: "user",
                    content: `Is this appropriate for a plant care community?: "${content}"`
                }
            ],
            response_format: { type: "json_object" }
        });

        const result = JSON.parse(response.choices[0].message.content);
        return Response.json(result);
    } catch (error) {
        console.error('Error in moderateContent:', error);
        // If moderation fails, allow the content but log the error
        return Response.json({ appropriate: true });
    }
});