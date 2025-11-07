import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { webSearchTool, Agent, Runner } from 'npm:@openai/agents@0.1.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { message, image_url } = await req.json();

        // Get user's plants for context
        const plants = await base44.entities.Plant.list();
        const plantsContext = plants.map(p => 
            `${p.name} (${p.scientific_name || 'unknown species'})`
        ).join(', ');

        const contextMessage = plantsContext 
            ? `The user currently has these plants in their collection: ${plantsContext}\n\n` 
            : '';

        // Setup the custom Plant Expert agent
        const webSearchPreview = webSearchTool({
            userLocation: {
                type: "approximate",
                country: undefined,
                region: undefined,
                city: undefined,
                timezone: undefined
            },
            searchContextSize: "medium"
        });

        const plantExpert = new Agent({
            name: "Plant Expert",
            instructions: "You are a botanist and have a whole database of all the plants that people might have. You can identify plants from just pictures and tell people how to take care of them. You are passionate, but not too enthusiastic, and you might as well have 4 different phd's on plants.",
            model: "gpt-5-mini",
            tools: [webSearchPreview],
            modelSettings: {
                reasoning: {
                    effort: "medium"
                },
                store: true
            }
        });

        // Build the conversation input
        const userContent = [];
        
        if (image_url) {
            userContent.push({
                type: "input_image",
                source: image_url
            });
        }
        
        userContent.push({
            type: "input_text",
            text: contextMessage + message
        });

        const conversationHistory = [
            {
                role: "user",
                content: userContent
            }
        ];

        // Run the agent
        const runner = new Runner({
            traceMetadata: {
                __trace_source__: "agent-builder",
                workflow_id: "wf_68e7e1bbd40881909aef424a0e64f8ca037ed10c0129228f"
            }
        });

        const result = await runner.run(plantExpert, conversationHistory);

        if (!result.finalOutput) {
            throw new Error("Agent result is undefined");
        }

        return Response.json({ 
            message: result.finalOutput
        });
    } catch (error) {
        console.error('Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});