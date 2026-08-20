// Supabase Edge Function: ai-reply
// Generates an AI reply suggestion using Gemini 2.5 Flash
// Deploy: supabase functions deploy ai-reply --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey',
            },
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    try {
        const { threadId } = await req.json();
        if (!threadId) {
            return new Response(JSON.stringify({ error: 'threadId required' }), { status: 400 });
        }

        // Fetch thread details
        const { data: thread } = await supabase
            .from('inbox_threads')
            .select('*, contacts(name, email), domains(domain_name, sender_name, product_name)')
            .eq('id', threadId)
            .single();

        if (!thread) {
            return new Response(JSON.stringify({ error: 'Thread not found' }), { status: 404 });
        }

        // Fetch all messages in the thread
        const { data: messages } = await supabase
            .from('inbox_messages')
            .select('direction, body, created_at')
            .eq('thread_id', threadId)
            .order('created_at', { ascending: true });

        // Build conversation history for Gemini
        const contact = thread.contacts as any;
        const domain = thread.domains as any;
        const conversationLines = (messages || []).map((m: any) => {
            const label = m.direction === 'outbound' ? `${domain?.sender_name || 'Us'}` : `${contact?.name || contact?.email || 'Contact'}`;
            return `${label}: ${m.body}`;
        }).join('\n\n');

        const prompt = `You are a professional email reply assistant for ${domain?.product_name || domain?.domain_name || 'our company'}.

You are replying to ${contact?.name || 'the contact'} (${contact?.email || ''}).

Here is the full conversation history:
---
${conversationLines}
---

Write a professional, warm, and concise reply. Rules:
- Keep it under 80 words
- Be conversational, not corporate
- Do not use any links
- Do not use salesy language
- Sign off with just: ${domain?.sender_name || domain?.domain_name || 'Best'}
- Write plain text only, no HTML

Reply:`;

        // Call Gemini 2.5 Flash
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        if (!geminiKey) {
            return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not set' }), { status: 500 });
        }

        const geminiRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.7,
                        maxOutputTokens: 256,
                    },
                }),
            }
        );

        if (!geminiRes.ok) {
            const err = await geminiRes.text();
            console.error('Gemini API error:', err);
            return new Response(JSON.stringify({ error: 'Gemini API failed', detail: err }), { status: 502 });
        }

        const geminiData = await geminiRes.json();
        const reply = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || '';

        return new Response(JSON.stringify({ reply: reply.trim() }), {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch (err: any) {
        console.error('AI reply error:', err);
        return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
});
