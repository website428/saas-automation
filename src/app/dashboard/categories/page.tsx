"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Trash2, ListOrdered, Users } from "lucide-react";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}
function inputStyle(t: Theme): React.CSSProperties {
    return { width: '100%', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, fontSize: '14px', outline: 'none', transition: 'border-color 200ms ease', fontFamily: t.font };
}

export default function CategoriesPage() {
    const { theme: t } = useTheme();
    const [categories, setCategories] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    async function load() {
        // Query categories and count contacts for each
        const { data, error } = await supabase
            .from('categories')
            .select('*, contacts(count)')
            .order('created_at', { ascending: false });

        if (!error && data) {
            const mapped = data.map(c => ({ ...c, contact_count: c.contacts[0]?.count || 0 }));
            setCategories(mapped);
        }
        setLoading(false);
    }

    useEffect(() => { load(); }, []);

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to delete this category AND all of its associated contacts? This action cannot be undone.")) return;
        // Delete associated contacts first
        await supabase.from('contacts').delete().eq('category_id', id);
        // Then delete the category
        await supabase.from('categories').delete().eq('id', id);
        setCategories(prev => prev.filter(c => c.id !== id));
    }

    const filtered = categories.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '1000px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Categories</h1>
                    <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Manage your contact lists for targeted campaigns.</p>
                </div>
                <Link href="/dashboard/categories/new" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: t.accent, color: '#fff', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                    <Plus style={{ width: '16px', height: '16px' }} />
                    New Category
                </Link>
            </div>

            {/* List */}
            <div style={{ ...card(t), padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
                        <Search style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '15px', height: '15px', color: t.textMuted }} />
                        <input
                            value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Find a category…"
                            style={{ ...inputStyle(t), paddingLeft: '36px' }}
                        />
                    </div>
                </div>
                
                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>Loading categories…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: '48px', textAlign: 'center', color: t.textMuted }}>
                        <ListOrdered style={{ width: '28px', height: '28px', margin: '0 auto 12px', opacity: 0.4 }} />
                        <p style={{ fontSize: '14px' }}>No categories created yet.</p>
                        <Link href="/dashboard/categories/new" style={{ color: t.accent, fontWeight: 500, textDecoration: 'none', fontSize: '13px' }}>Create your first category →</Link>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                            <thead>
                                <tr style={{ borderBottom: `1px solid ${t.borderLight}`, background: t.cardInner }}>
                                    <th style={{ padding: '14px 20px', ...lbl(t) }}>Category Name</th>
                                    <th style={{ padding: '14px 20px', ...lbl(t) }}>Contacts</th>
                                    <th style={{ padding: '14px 20px', ...lbl(t) }}>Created</th>
                                    <th style={{ padding: '14px 20px', ...lbl(t), textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((cat, i) => (
                                    <tr key={cat.id} style={{ borderBottom: i < filtered.length - 1 ? `1px solid ${t.borderLight}` : 'none' }}>
                                        <td style={{ padding: '16px 20px' }}>
                                            <Link href={`/dashboard/categories/${cat.id}`} style={{ fontWeight: 600, color: t.text, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <ListOrdered style={{ width: '16px', height: '16px', color: t.accent }} />
                                                {cat.name}
                                            </Link>
                                        </td>
                                        <td style={{ padding: '16px 20px', color: t.textMuted }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Users style={{ width: '14px', height: '14px' }} />
                                                {cat.contact_count.toLocaleString()}
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px 20px', color: t.textMuted, fontSize: '13px' }}>
                                            {new Date(cat.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                                            <button onClick={() => handleDelete(cat.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: t.textMuted }} title="Delete Category">
                                                <Trash2 style={{ width: '15px', height: '15px' }} />
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
