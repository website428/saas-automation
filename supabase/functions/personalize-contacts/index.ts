// Generates per-contact campaign copy. Deploy with JWT verification enabled:
// supabase functions deploy personalize-contacts

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json',
};

const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

type Contact = {
    id: string;
    email: string;
    name: string | null;
    company_name: string | null;
    job_title: string | null;
    website: string | null;
    personalization: string | null;
};

function companyFromEmail(email: string): string {
    const host = email.split('@')[1]?.toLowerCase() || '';
    if (!host || /^(gmail|yahoo|outlook|hotmail|icloud|protonmail)\./.test(host)) return '';
    const label = host.split('.').slice(0, -1).join(' ').replace(/[-_]/g, ' ');
    return label.replace(/\b\w/g, c => c.toUpperCase());
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
    if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });

    try {
        const geminiKey = Deno.env.get('GEMINI_API_KEY');
        if (!geminiKey) throw new Error('GEMINI_API_KEY is not configured');

        const { contactIds, productName, brief, baseSubject, baseBody } = await req.json();
        if (!Array.isArray(contactIds) || contactIds.length === 0 || contactIds.length > 20) {
            return new Response(JSON.stringify({ error: 'Choose between 1 and 20 contacts per request' }), { status: 400, headers: corsHeaders });
        }
        if (!baseSubject?.trim() || !baseBody?.trim()) {
            return new Response(JSON.stringify({ error: 'A campaign subject and body are required' }), { status: 400, headers: corsHeaders });
        }

        const { data, error } = await supabase
            .from('contacts')
            .select('id,email,name,company_name,job_title,website,personalization')
            .in('id', contactIds);
        if (error) throw error;

        const contacts = (data || []) as Contact[];
        const facts = contacts.map(c => ({
            id: c.id,
            name: c.name || '',
            company: c.company_name || companyFromEmail(c.email),
            job_title: c.job_title || '',
            website: c.website || '',
            supplied_personalization: c.personalization || '',
        }));

        const prompt = `Create one concise, permission-based business email for each contact.

Offer/product: ${productName || 'our product'}
Sender brief: ${brief?.trim() || 'Use the campaign draft and keep its core offer and call to action.'}
Base subject: ${baseSubject.trim()}
Base body:
${baseBody.trim()}

Rules:
- Return valid JSON only, matching the requested schema.
- Use only facts in the supplied contact data and sender brief. Never invent funding, hiring, growth, launches, achievements, industry, or website activity.
- Never claim you visited a website, saw a profile, or noticed something unless that exact fact appears in supplied_personalization.
- Make each subject and body meaningfully specific to the person's company, role, or supplied personalization.
- If little information exists, be honest and lightly personalize with the name/company; do not fabricate research.
- Keep subjects under 60 characters and bodies between 60 and 130 words, plain text, with one low-pressure question.
- Avoid spammy urgency, exaggerated claims, tracking language, and fake familiarity.
- Do not add an unsubscribe footer; the sending system adds it.

Contacts:
${JSON.stringify(facts)}`;

        const model = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash';
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.65,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json',
                        responseSchema: {
                            type: 'OBJECT',
                            properties: {
                                emails: {
                                    type: 'ARRAY',
                                    items: {
                                        type: 'OBJECT',
                                        properties: {
                                            id: { type: 'STRING' },
                                            personalization: { type: 'STRING' },
                                            subject: { type: 'STRING' },
                                            body: { type: 'STRING' },
                                        },
                                        required: ['id', 'personalization', 'subject', 'body'],
                                    },
                                },
                            },
                            required: ['emails'],
                        },
                    },
                }),
            },
        );

        if (!response.ok) throw new Error(`Gemini request failed (${response.status})`);
        const result = await response.json();
        const raw = result?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = JSON.parse(raw);
        const allowedIds = new Set(contacts.map(c => c.id));
        const updates = (parsed.emails || [])
            .filter((item: any) => allowedIds.has(item.id))
            .map((item: any) => ({
                id: item.id,
                personalization: String(item.personalization || '').trim().slice(0, 1000),
                custom_subject: String(item.subject || '').trim().slice(0, 200),
                custom_body: String(item.body || '').trim().slice(0, 10000),
            }))
            .filter((item: any) => item.custom_subject && item.custom_body);

        for (const update of updates) {
            const { id, ...fields } = update;
            const { error: updateError } = await supabase.from('contacts').update(fields).eq('id', id);
            if (updateError) throw updateError;
        }

        return new Response(JSON.stringify({ updated: updates.length, contacts: updates }), { status: 200, headers: corsHeaders });
    } catch (err: any) {
        console.error('personalize-contacts error:', err.message);
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: corsHeaders });
    }
});

