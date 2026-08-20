"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, Trash2, Mail, UserRound } from "lucide-react";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}
function inputStyle(t: Theme): React.CSSProperties {
    return { width: '100%', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, fontSize: '14px', outline: 'none', transition: 'border-color 200ms ease', fontFamily: t.font };
}

export default function CategoryDetailPage() {
    const { id } = useParams();
    const { theme: t } = useTheme();
    const [category, setCategory] = useState<any>(null);
    const [contacts, setContacts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    async function load() {
        if (!id) return;
        
        // Fetch category details
        const { data: catData } = await supabase
            .from('categories')
            .select('*')
            .eq('id', id)
            .single();
            
        setCategory(catData);

        // Fetch contacts for this category
        const { data: contactData } = await supabase
            .from('contacts')
            .select('*')
            .eq('category_id', id)
            .order('created_at', { ascending: false });

        setContacts(contactData || []);
        setLoading(false);
    }

    useEffect(() => { load(); }, [id]);

    async function handleDeleteContact(contactId: string) {
        if (!confirm("Remove this contact from the category?")) return;
        
        // Disassociate contact rather than full delete
        await supabase
            .from('contacts')
            .update({ category_id: null })
            .eq('id', contactId);
            
        setContacts(prev => prev.filter(c => c.id !== contactId));
    }

    async function handleCleanList() {
        if (!confirm("This will permanently delete all 'bounced' (including fake domains) and 'unsubscribed' contacts from this category. Continue?")) return;
        
        setLoading(true);
        await supabase
            .from('contacts')
            .delete()
            .eq('category_id', id)
            .in('status', ['bounced', 'unsubscribed']);
            
        await load();
    }


    const filtered = contacts.filter(c =>
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.name && c.name.toLowerCase().includes(search.toLowerCase()))
    );

    const statusMap: Record<string, { color: string; bg: string }> = {
        pending: { color: t.textMuted, bg: t.cardInner },
        sent: { color: t.green, bg: t.greenSoft },
        bounced: { color: t.coral, bg: t.coralSoft },
        unsubscribed: { color: t.amber, bg: t.amberSoft },
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '1000px' }}>
            {/* Header */}
            <div>
                <Link href="/dashboard/categories" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: t.textMuted, textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}
                    onMouseEnter={e => (e.currentTarget.style.color = t.text)}
                    onMouseLeave={e => (e.currentTarget.style.color = t.textMuted)}
                >
                    <ArrowLeft style={{ width: '14px', height: '14px' }} /> Back to Categories
                </Link>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>
                            {category ? category.name : 'Loading...'}
                        </h1>
                        <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>
                            {contacts.length} contacts in this category
                        </p>
                    </div>
                    
                    <button 
                        onClick={handleCleanList} 
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: t.coralSoft, color: t.coral, border: `1px solid ${t.coral}40`, fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: t.font }}
                    >
                        <Trash2 style={{ width: '16px', height: '16px' }} />
                        Clean Bounces
                    </button>
                </div>
            </div>

            {/* List */}
            <div style={{ ...card(t), padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                        <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', color: t.textMuted }} />
                        <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name or email…"
                            style={{ ...inputStyle(t), paddingLeft: '36px' }}
                        />
                    </div>
                </div>
                
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>Loading contacts…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>No contacts found in this category.</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${t.borderLight}`, background: t.cardInner }}>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Contact</th>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Status</th>
                                    <th style={{ padding: '12px 20px', ...lbl(t) }}>Added</th>
                                    <th style={{ padding: '12px 20px', ...lbl(t), textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((contact, i) => (
                                    <tr key={contact.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${t.borderLight}` : 'none' }}>
                                        <td style={{ padding: '14px 20px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: t.cardInner, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <UserRound style={{ width: '14px', height: '14px', color: t.textMuted }} />
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontWeight: 500, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name || '—'}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td style={{ padding: '14px 20px' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', color: (statusMap[contact.status] || statusMap.pending).color, background: (statusMap[contact.status] || statusMap.pending).bg, textTransform: 'capitalize' }}>
                                                {contact.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '14px 20px', color: t.textMuted, fontSize: '12px' }}>
                                            {new Date(contact.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteContact(contact.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: t.textMuted }} title="Remove from Category">
                                                <Trash2 style={{ width: '14px', height: '14px' }} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
