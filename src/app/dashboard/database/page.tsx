"use client";

import { useState, useEffect } from "react";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";
import { Database, AlertTriangle, Edit2, Trash2, X, Check, RefreshCw, Plus } from "lucide-react";

// The tables we want to expose to the frontend editor
const TABLES = [
    "domains",
    "categories",
    "contacts",
    "campaigns",
    "email_queue",
    "webhook_events",
    "autopilot_log"
];

// Provide clear dependency warnings for the user
const TABLE_DEPENDENCIES: Record<string, string> = {
    domains: "🚨 WARNING: Domains are top-level. Deleting a domain will CASCADE DELETE all its Campaigns, Email Queue, and Webhook Events.",
    categories: "Warning: Categories organize contacts. Deleting a category manually from the database does NOT trigger the app's clean-up scripts, potentially leaving ghost contacts.",
    contacts: "🚨 WARNING: Contacts link to queue items. Deleting a contact will CASCADE DELETE their pending items in the Email Queue and their historical tracking.",
    campaigns: "🚨 WARNING: Campaigns are parent objects. Deleting a campaign will CASCADE DELETE all its pending and sent items in the Email Queue.",
    email_queue: "Safe: The Email Queue is mostly a leaf node. Deleting a row just permanently removes that specific email from the sending process.",
    webhook_events: "Safe: This is just an event log from Resend. Deleting rows here has no effect on your campaigns.",
    autopilot_log: "Safe: This is just an execution log from the background mailer. Deleting rows here has no effect."
};

function card(t: Theme): React.CSSProperties {
    return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}

export default function DatabaseEditorPage() {
    const { theme: t } = useTheme();
    const [table, setTable] = useState<string>("domains");
    const [rows, setRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state for editing & adding
    const [editingRow, setEditingRow] = useState<any | null>(null);
    const [addingRow, setAddingRow] = useState(false);
    const [editJson, setEditJson] = useState<string>("");
    const [saving, setSaving] = useState(false);

    async function loadData() {
        setLoading(true);
        setError(null);
        try {
            const { data, error: fetchError } = await supabase
                .from(table)
                .select('*')
                .limit(100)
                .order('id', { ascending: false, nullsFirst: false });

            if (fetchError) throw fetchError;
            setRows(data || []);
        } catch (err: any) {
            setError(err.message || "Failed to load table data");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
    }, [table]);

    function openEdit(row: any) {
        setEditingRow(row);
        setAddingRow(false);
        setEditJson(JSON.stringify(row, null, 2));
    }

    function openAdd() {
        setAddingRow(true);
        setEditingRow(null);
        // Provide a basic template based on the table if possible, otherwise empty object
        const template = table === 'domains'
          ? {
              domain_name: "mail.brand.com",
              from_email: "hello@mail.brand.com",
              sender_name: "Your Name",
              product_name: "Brand",
              daily_limit: 50,
              status: "warming",
              health_score: 100,
              warmup_day: 1,
              warmup_start: new Date().toISOString().split('T')[0],
              send_hour_start: 9,
              send_hour_end: 20,
              emails_sent_today: 0
            }
          : {};
        setEditJson(JSON.stringify(template, null, 2));
    }

    async function saveEdit() {
        try {
            setSaving(true);
            setError(null);
            const parsed = JSON.parse(editJson);

            if (addingRow) {
                // Insert new row
                const { error: insertErr } = await supabase.from(table).insert(parsed);
                if (insertErr) throw insertErr;
            } else {
                // Update existing row
                if (!parsed.id) throw new Error("Row must have an 'id' to be updated.");
                const { error: updateErr } = await supabase.from(table).update(parsed).eq('id', parsed.id);
                if (updateErr) throw updateErr;
            }

            setEditingRow(null);
            setAddingRow(false);
            await loadData();
        } catch (err: any) {
            alert("Save failed: " + err.message);
        } finally {
            setSaving(false);
        }
    }

    async function deleteRow(id: any) {
        if (!confirm("Are you incredibly sure? This could trigger CASCADE DELETES based on the warnings above!")) return;
        
        try {
            setLoading(true);
            const { error: delErr } = await supabase.from(table).delete().eq('id', id);
            if (delErr) throw delErr;
            await loadData();
        } catch (err: any) {
            alert("Delete failed: " + err.message);
            setLoading(false);
        }
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '1200px' }}>
            {/* Header */}
            <div>
                <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Backend Database Editor</h1>
                <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Directly view, add, and manipulate raw database records from the frontend.</p>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ ...card(t), padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                    <Database style={{ color: t.accent, width: '20px', height: '20px' }} />
                    <select
                        value={table}
                        onChange={e => setTable(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', border: `1px solid ${t.border}`, background: t.cardInner, color: t.text, fontFamily: t.font, fontSize: '14px', minWidth: '200px' }}
                    >
                        {TABLES.map(tb => <option key={tb} value={tb}>{tb}</option>)}
                    </select>
                    
                    <button onClick={loadData} disabled={loading} style={{ padding: '8px 12px', borderRadius: '8px', background: t.cardInner, border: `1px solid ${t.border}`, color: t.text, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                        <RefreshCw style={{ width: '14px', height: '14px', animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        Refresh
                    </button>
                    
                    <button onClick={openAdd} style={{ padding: '8px 12px', borderRadius: '8px', background: t.accent, border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, marginLeft: 'auto' }}>
                        <Plus style={{ width: '16px', height: '16px' }} />
                        Add New Record
                    </button>
                    <span style={{ fontSize: '13px', color: t.textMuted, marginLeft: '12px' }}>Showing latest 100</span>
                </div>
            </div>

            {/* Dependency Warning Banner */}
            <div style={{ padding: '16px 20px', borderRadius: '12px', background: table === 'email_queue' || table.includes('log') || table === 'webhook_events' ? t.greenSoft : t.amberSoft, border: `1px solid ${table === 'email_queue' || table.includes('log') || table === 'webhook_events' ? t.green : t.amber}40`, display: 'flex', gap: '12px' }}>
                <AlertTriangle style={{ width: '20px', height: '20px', color: table === 'email_queue' || table.includes('log') || table === 'webhook_events' ? t.green : t.amber, flexShrink: 0 }} />
                <div>
                    <strong style={{ fontSize: '14px', color: t.text, display: 'block', marginBottom: '4px' }}>Dependencies & Side Effects</strong>
                    <span style={{ fontSize: '13.5px', color: t.textSec, lineHeight: 1.5 }}>{TABLE_DEPENDENCIES[table]}</span>
                </div>
            </div>

            {/* Data Table */}
            <div style={{ ...card(t), padding: '0', overflowX: 'auto' }}>
                {error && <div style={{ padding: '24px', color: t.coral, textAlign: 'center' }}>{error}</div>}
                
                {!error && rows.length === 0 && !loading && (
                    <div style={{ padding: '40px', textAlign: 'center', color: t.textMuted }}>No records found in table "{table}".</div>
                )}

                {rows.length > 0 && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: t.cardInner, borderBottom: `1px solid ${t.border}` }}>
                                <th style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Actions</th>
                                {Object.keys(rows[0]).map(key => (
                                    <th key={key} style={{ padding: '12px 16px', fontSize: '12px', fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{key}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, i) => (
                                <tr key={row.id || i} style={{ borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${t.border}` }}>
                                    <td style={{ padding: '12px 16px', display: 'flex', gap: '8px' }}>
                                        <button onClick={() => openEdit(row)} style={{ padding: '6px', borderRadius: '6px', background: t.accentSoft, color: t.accent, border: 'none', cursor: 'pointer' }}><Edit2 style={{ width: '14px', height: '14px' }} /></button>
                                        <button onClick={() => deleteRow(row.id)} style={{ padding: '6px', borderRadius: '6px', background: t.coralSoft, color: t.coral, border: 'none', cursor: 'pointer' }}><Trash2 style={{ width: '14px', height: '14px' }} /></button>
                                    </td>
                                    {Object.entries(row).map(([k, v]) => (
                                        <td key={k} style={{ padding: '12px 16px', fontSize: '13px', color: t.textSec, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* JSON Edit/Add Modal */}
            {(editingRow || addingRow) && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                    <div style={{ ...card(t), width: '600px', maxWidth: '90%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '18px', color: t.text }}>{addingRow ? 'Add New Record' : 'Edit JSON'} (Table: {table})</h2>
                            <button onClick={() => { setEditingRow(null); setAddingRow(false); }} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer' }}><X style={{ width: '20px', height: '20px' }} /></button>
                        </div>
                        <p style={{ margin: 0, fontSize: '13px', color: t.textMuted }}>
                            {addingRow ? "Enter the raw JSON object to insert into the database. Do not include an 'id' if the database auto-generates it." : "Edit the raw JSON data for this record."} Ensure it is valid JSON before saving.
                        </p>
                        <textarea
                            value={editJson}
                            onChange={(e) => setEditJson(e.target.value)}
                            style={{ width: '100%', height: '300px', padding: '12px', borderRadius: '8px', background: '#0a0a12', border: `1px solid ${t.border}`, color: '#a78bfa', fontFamily: 'monospace', fontSize: '13px', resize: 'vertical' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => { setEditingRow(null); setAddingRow(false); }} style={{ padding: '8px 16px', borderRadius: '8px', background: t.cardInner, color: t.text, border: `1px solid ${t.border}`, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={saveEdit} disabled={saving} style={{ padding: '8px 16px', borderRadius: '8px', background: t.accent, color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                <Check style={{ width: '16px', height: '16px' }} />
                                {saving ? "Saving..." : (addingRow ? "Insert Record" : "Save Record")}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
