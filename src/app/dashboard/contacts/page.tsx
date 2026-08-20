"use client";

import { useEffect, useState } from "react";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Trash2, Mail, UserRound } from "lucide-react";

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
    return { fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: t.textMuted, fontFamily: t.font };
}
function inputStyle(t: Theme): React.CSSProperties {
    return { width: '100%', padding: '10px 14px', borderRadius: '10px', border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, fontSize: '14px', outline: 'none', transition: 'border-color 200ms ease', fontFamily: t.font };
}

const responsiveStyles = `
  .contacts-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 24px;
    align-items: start;
  }
  .contacts-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .contacts-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 13px; }
  .contacts-col-tags, .contacts-col-added { display: table-cell; }

  @media (max-width: 768px) {
    .contacts-layout {
      grid-template-columns: 1fr;
    }
    .contacts-col-tags, .contacts-col-added { display: none; }
    .contacts-header h1 { font-size: 22px !important; }
  }
`;

export default function ContactsPage() {
    const { theme: t } = useTheme();
    const [contacts, setContacts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");

    // new contact state
    const [newEmail, setNewEmail] = useState("");
    const [newName, setNewName] = useState("");
    const [newCompany, setNewCompany] = useState("");
    const [newJobTitle, setNewJobTitle] = useState("");
    const [newPersonalization, setNewPersonalization] = useState("");
    const [adding, setAdding] = useState(false);
    const [cleaning, setCleaning] = useState(false);

    async function load() {
        const { data } = await supabase.from('contacts').select('*, categories(name)').order('created_at', { ascending: false });
        setContacts(data || []);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    async function handleAdd(e: React.FormEvent) {
        e.preventDefault();
        if (!newEmail) return;
        setAdding(true);
        await supabase.from('contacts').insert({
            email: newEmail.trim().toLowerCase(),
            name: newName.trim() || null,
            company_name: newCompany.trim() || null,
            job_title: newJobTitle.trim() || null,
            personalization: newPersonalization.trim() || null,
            tags: ['manual'],
        });
        setNewEmail("");
        setNewName("");
        setNewCompany("");
        setNewJobTitle("");
        setNewPersonalization("");
        await load();
        setAdding(false);
    }

    async function handleDelete(id: string) {
        await supabase.from('contacts').delete().eq('id', id);
        setContacts(prev => prev.filter(c => c.id !== id));
    }

    async function handleNukeAll() {
        const confirm1 = confirm("🚨 DANGER: Do you want to WIPE OUT ALL CONTACTS from this entire system?");
        if (!confirm1) return;
        const confirm2 = confirm("Are you 100% sure? This will delete all 16,000+ contacts instantly. There is no undo.");
        if (!confirm2) return;
        
        setCleaning(true);
        
        // Fetch all IDs first to bypass tricky RLS mass-delete restrictions
        const { data: allContacts } = await supabase.from('contacts').select('id');
        const ids = (allContacts || []).map(c => c.id);
        
        if (ids.length > 0) {
            // Delete in safe chunks of 800 to prevent Supabase from timing out
            for (let i = 0; i < ids.length; i += 800) {
                const chunk = ids.slice(i, i + 800);
                await supabase.from('contacts').delete().in('id', chunk);
            }
        }
        
        await load();
        setCleaning(false);
        alert(`Successfully wiped out ${ids.length} contacts! System is fresh.`);
    }

    async function handleCleanFakes() {
        if (!confirm("Delete all known fake/disposable emails from your contacts list?")) return;
        setCleaning(true);
        
        // PostgREST doesn't support massive regex easily, so we use common "OR" logic for fake domains
        const BAD_DOMAINS = ['tempmail.com','yopmail.com','mailinator.com','guerrillamail.com','test.com','example.com','fake.com'];
        // Note: Using a series of LIKE queries for common fake prefixes
        const promises = BAD_DOMAINS.map(domain => 
            supabase.from('contacts').delete().ilike('email', `%@${domain}`)
        );
        
        promises.push(supabase.from('contacts').delete().ilike('email', `test@%`));
        promises.push(supabase.from('contacts').delete().ilike('email', `dummy@%`));
        promises.push(supabase.from('contacts').delete().ilike('email', `fake@%`));
        promises.push(supabase.from('contacts').delete().ilike('email', `spam@%`));

        await Promise.all(promises);
        await load();
        setCleaning(false);
    }

    const filtered = contacts.filter(c =>
        c.email.toLowerCase().includes(search.toLowerCase()) ||
        (c.name && c.name.toLowerCase().includes(search.toLowerCase())) ||
        (c.company_name && c.company_name.toLowerCase().includes(search.toLowerCase()))
    );

    const statusMap: Record<string, { color: string; bg: string }> = {
        pending: { color: t.textMuted, bg: t.cardInner },
        sent: { color: t.green, bg: t.greenSoft },
        bounced: { color: t.coral, bg: t.coralSoft },
        unsubscribed: { color: t.amber, bg: t.amberSoft },
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '1000px' }}>
            <style>{responsiveStyles}</style>

            {/* Header */}
            <div className="contacts-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Contacts</h1>
                    <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Manage your outreach targets. {contacts.length} total.</p>
                </div>
                
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                        onClick={handleCleanFakes}
                        disabled={cleaning}
                        title="Delete test@, dummy@, and disposable email domains"
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: t.amberSoft, color: t.amber, border: `1px solid ${t.amber}40`, fontSize: '13px', fontWeight: 600, cursor: cleaning ? 'not-allowed' : 'pointer', fontFamily: t.font, opacity: cleaning ? 0.7 : 1 }}
                    >
                        <Trash2 style={{ width: '16px', height: '16px' }} />
                        {cleaning ? 'Cleaning...' : 'Wipe Fake Emails'}
                    </button>
                    <button 
                        onClick={handleNukeAll}
                        disabled={cleaning}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: `1px solid #ef4444`, fontSize: '13px', fontWeight: 700, cursor: cleaning ? 'not-allowed' : 'pointer', fontFamily: t.font, opacity: cleaning ? 0.7 : 1 }}
                    >
                        <Trash2 style={{ width: '16px', height: '16px' }} />
                        {cleaning ? 'Nuking Database...' : 'Wipe OUT All Mails (Nuke)'}
                    </button>
                </div>
            </div>

            <div className="contacts-layout">

                {/* List */}
                <div style={{ ...card(t), padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '20px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{ position: 'relative', flex: 1 }}>
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
                        <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted, fontSize: '14px' }}>No contacts found.</div>
                    ) : (
                        <div className="contacts-table-wrap">
                            <table className="contacts-table">
                                <thead>
                                    <tr style={{ borderBottom: `1px solid ${t.borderLight}` }}>
                                        <th style={{ padding: '12px 20px', ...lbl(t) }}>Contact</th>
                                        <th className="contacts-col-tags" style={{ padding: '12px 20px', ...lbl(t) }}>Category & Tags</th>
                                        <th style={{ padding: '12px 20px', ...lbl(t) }}>Status</th>
                                        <th className="contacts-col-added" style={{ padding: '12px 20px', ...lbl(t) }}>Added</th>
                                        <th style={{ padding: '12px 20px', ...lbl(t), textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(contact => (
                                        <tr key={contact.id} style={{ borderBottom: `1px solid ${t.borderLight}` }}>
                                            <td style={{ padding: '14px 20px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: t.cardInner, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <UserRound style={{ width: '14px', height: '14px', color: t.textMuted }} />
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <p style={{ margin: 0, fontWeight: 500, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.name || '—'}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{contact.email}</p>
                                                        {contact.company_name && <p style={{ margin: '2px 0 0', fontSize: '11px', color: t.textSec }}>{contact.job_title ? `${contact.job_title} · ` : ''}{contact.company_name}</p>}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="contacts-col-tags" style={{ padding: '14px 20px' }}>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {contact.categories && (
                                                        <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', background: t.accentSoft, color: t.accent }}>
                                                            {contact.categories.name}
                                                        </span>
                                                    )}
                                                    {(contact.tags || []).map((tag: string) => (
                                                        <span key={tag} style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px', background: t.cardInner, color: t.textSec }}>
                                                            {tag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td style={{ padding: '14px 20px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '12px', color: (statusMap[contact.status] || statusMap.pending).color, background: (statusMap[contact.status] || statusMap.pending).bg, textTransform: 'capitalize' }}>
                                                    {contact.status}
                                                </span>
                                            </td>
                                            <td className="contacts-col-added" style={{ padding: '14px 20px', color: t.textMuted, fontSize: '12px' }}>
                                                {new Date(contact.created_at).toLocaleDateString()}
                                            </td>
                                            <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                                                <button onClick={() => handleDelete(contact.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '6px', color: t.textMuted }} title="Delete">
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

                {/* Add new contact form */}
                <form onSubmit={handleAdd} style={{ ...card(t), display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: t.text }}>Add Contact</h3>
                    <div>
                        <label style={{ ...lbl(t), display: 'block', marginBottom: '6px' }}>Email *</label>
                        <div style={{ position: 'relative' }}>
                            <Mail style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: t.textMuted }} />
                            <input type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="contact@example.com" style={{ ...inputStyle(t), paddingLeft: '34px' }} />
                        </div>
                    </div>
                    <div>
                        <label style={{ ...lbl(t), display: 'block', marginBottom: '6px' }}>Name (Optional)</label>
                        <div style={{ position: 'relative' }}>
                            <UserRound style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', width: '14px', height: '14px', color: t.textMuted }} />
                            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="John Doe" style={{ ...inputStyle(t), paddingLeft: '34px' }} />
                        </div>
                    </div>
                    <div>
                        <label style={{ ...lbl(t), display: 'block', marginBottom: '6px' }}>Company</label>
                        <input value={newCompany} onChange={e => setNewCompany(e.target.value)} placeholder="Acme Ltd" style={inputStyle(t)} />
                    </div>
                    <div>
                        <label style={{ ...lbl(t), display: 'block', marginBottom: '6px' }}>Job Title</label>
                        <input value={newJobTitle} onChange={e => setNewJobTitle(e.target.value)} placeholder="Finance Director" style={inputStyle(t)} />
                    </div>
                    <div>
                        <label style={{ ...lbl(t), display: 'block', marginBottom: '6px' }}>Personalized Opening</label>
                        <textarea value={newPersonalization} onChange={e => setNewPersonalization(e.target.value)} placeholder="Saw your recent expansion into…" rows={3} style={{ ...inputStyle(t), resize: 'vertical' }} />
                    </div>
                    <button type="submit" disabled={adding || !newEmail} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '10px', borderRadius: '10px', background: t.accent, color: '#fff', border: 'none', fontWeight: 600, cursor: (adding || !newEmail) ? 'not-allowed' : 'pointer', opacity: (adding || !newEmail) ? 0.7 : 1, transition: 'opacity 200ms ease', fontFamily: t.font, marginTop: '8px' }}>
                        <Plus style={{ width: '15px', height: '15px' }} />
                        {adding ? 'Adding…' : 'Add Contact'}
                    </button>
                </form>

            </div>
        </div>
    );
}
