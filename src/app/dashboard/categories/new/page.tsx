"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Upload, FileType, CheckCircle, AlertTriangle } from "lucide-react";
import { useTheme, Theme } from "@/components/theme-provider";
import { supabase } from "@/lib/supabase";

function card(t: Theme): React.CSSProperties {
  return { background: t.card, border: `1px solid ${t.border}`, borderRadius: '14px', padding: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' };
}
function lbl(t: Theme): React.CSSProperties {
  return { display: 'block', fontSize: '13px', fontWeight: 600, color: t.textSec, marginBottom: '8px', fontFamily: t.font };
}
function inputStyle(t: Theme): React.CSSProperties {
  return {
    width: '100%', padding: '12px 14px', borderRadius: '10px', fontSize: '14px', fontFamily: t.font,
    border: `1px solid ${t.borderLight}`, background: t.cardInner, color: t.text, outline: 'none',
    boxSizing: 'border-box', transition: 'border-color 150ms',
  };
}

export default function NewCategoryPage() {
  const { theme: t } = useTheme();
  const router = useRouter();

  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) { setError("Category name is required."); return; }
    if (!file) { setError("Please upload a CSV file containing contacts."); return; }
    
    setLoading(true); setError(""); setSuccess("");
    
    try {
      // 1. Create the category in the database
      const { data: catData, error: catErr } = await supabase
        .from('categories')
        .insert({ name: name.trim() })
        .select()
        .single();
        
      if (catErr || !catData) {
        throw new Error(catErr?.message || "Failed to create category. Ensure the name is unique.");
      }
      
      const newCategoryId = catData.id;
      
      // 2. Parse the CSV or Excel file
      const processRows = async (rows: any[][], categoryId: string) => {
          if (!rows || rows.length === 0) throw new Error("File is empty.");
          const headers = (rows[0] || []).map(h => String(h).trim().toLowerCase());
          const findColumn = (...aliases: string[]) => headers.findIndex(h => aliases.includes(h));
          let emailIdx = findColumn('email', 'email address', 'work email');
          let nameIdx = findColumn('name', 'full name', 'contact name', 'first name');
          let dataStart = 1;
          // Support the existing two-column file even when it has no header row.
          if (emailIdx === -1) {
            const firstRowEmail = (rows[0] || []).findIndex(value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim()));
            if (firstRowEmail !== -1) {
              emailIdx = firstRowEmail;
              nameIdx = firstRowEmail === 0 ? 1 : 0;
              dataStart = 0;
            }
          }
          const companyIdx = findColumn('company', 'company name', 'organization', 'organisation');
          const titleIdx = findColumn('job title', 'title', 'role', 'position');
          const websiteIdx = findColumn('website', 'company website', 'domain', 'company domain');
          const personalizationIdx = findColumn('personalization', 'personalisation', 'personalized line', 'personalised line', 'icebreaker', 'opening line');
          const customSubjectIdx = findColumn('custom subject', 'email subject', 'subject');
          const customBodyIdx = findColumn('custom body', 'email body', 'body', 'message');
          
          if (emailIdx === -1) throw new Error("Could not find an 'Email' column in the file.");
          
          // Lists to block obvious fakes, disposables, and dummy emails
          const BLOCK_DOMAINS = new Set([
              "tempmail.com", "yopmail.com", "mailinator.com", "10minutemail.com", "guerrillamail.com", 
              "throwawaymail.com", "trashmail.com", "mailinator.net", "sharklasers.com", "dispostable.com",
              "test.com", "example.com", "fake.com"
          ]);
          const BLOCK_PREFIXES = new Set(["test", "fake", "spam", "noreply", "no-reply", "dummy", "123"]);
          
          let skippedFakes = 0;
          const contactsToInsert = [];
          for (let i = dataStart; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= emailIdx) continue;
            const email = String(row[emailIdx] || '').trim().toLowerCase();
            if (!email || !email.includes('@')) continue;

            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(email)) { skippedFakes++; continue; }

            const [localPart, domainPart] = email.split('@');
            if (!localPart || !domainPart) { skippedFakes++; continue; }

            // Check against known fake domains and dummy prefixes
            if (BLOCK_DOMAINS.has(domainPart.toLowerCase())) { skippedFakes++; continue; }
            if (BLOCK_PREFIXES.has(localPart.toLowerCase())) { skippedFakes++; continue; }
            // Filter out keyboard smashes (e.g. asdfghjkl@gmail.com) by checking if local part has no vowels and is long OR too many sequential identical chars
            if (localPart.length > 7 && !/[aeiouy]/i.test(localPart)) { skippedFakes++; continue; }
            if (/(.)\1{4,}/.test(localPart)) { skippedFakes++; continue; } // e.g. aaaaa@...

            const contactName = nameIdx !== -1 && row[nameIdx] ? String(row[nameIdx]).trim() : null;
            const valueAt = (index: number) => index !== -1 && row[index] ? String(row[index]).trim() : null;
            const emailDomain = domainPart.toLowerCase();
            const isConsumerMailbox = /^(gmail|yahoo|outlook|hotmail|icloud|protonmail)\./.test(emailDomain);
            const derivedCompany = isConsumerMailbox
              ? null
              : emailDomain.split('.').slice(0, -1).join(' ').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            
            contactsToInsert.push({
              email,
              name: contactName,
              company_name: valueAt(companyIdx) || derivedCompany,
              job_title: valueAt(titleIdx),
              website: valueAt(websiteIdx) || (isConsumerMailbox ? null : `https://${emailDomain}`),
              personalization: valueAt(personalizationIdx),
              custom_subject: valueAt(customSubjectIdx),
              custom_body: valueAt(customBodyIdx),
              category_id: categoryId,
              tags: ['imported'],
            });
          }
          
          if (contactsToInsert.length === 0) throw new Error("No valid contacts found in the file.");
          
          const chunkSize = 1000;
          let insertedCount = 0;
          for (let i = 0; i < contactsToInsert.length; i += chunkSize) {
            const chunk = contactsToInsert.slice(i, i + chunkSize);
            const { error: insertErr } = await supabase.from('contacts').insert(chunk);
            if (!insertErr) insertedCount += chunk.length;
          }
          
          setSuccess(`Successfully imported ${insertedCount} contacts. Auto-filtered ${skippedFakes} fake/invalid emails!`);
          setTimeout(() => { router.push('/dashboard/categories'); }, 1500);
      };

      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const XLSX = await import('xlsx');
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];
          await processRows(rows, newCategoryId);
        } catch (err: any) {
           setError(err.message);
           setLoading(false);
        }
      };
      
      reader.readAsArrayBuffer(file);
      
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', fontFamily: t.font, maxWidth: '640px' }}>
      <div>
        <Link href="/dashboard/categories" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: t.textMuted, textDecoration: 'none', marginBottom: '16px', fontWeight: 500 }}
          onMouseEnter={e => (e.currentTarget.style.color = t.text)}
          onMouseLeave={e => (e.currentTarget.style.color = t.textMuted)}
        >
          <ArrowLeft style={{ width: '14px', height: '14px' }} /> Back to Categories
        </Link>
        <h1 style={{ fontSize: '26px', fontWeight: 700, letterSpacing: '-0.03em', color: t.text, margin: 0 }}>Create Category & Import</h1>
        <p style={{ marginTop: '6px', fontSize: '14px', color: t.textMuted }}>Upload a CSV or Excel file to create a targeted list of contacts.</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div style={card(t)}>
          <label style={lbl(t)}>Category Name *</label>
          <input 
            value={name} 
            onChange={e => setName(e.target.value)} 
            placeholder="e.g. Q4 Real Estate Leads"
            style={inputStyle(t)}
            onFocus={e => (e.target.style.borderColor = t.accent)}
            onBlur={e => (e.target.style.borderColor = t.borderLight)}
          />
        </div>

        <div style={{ ...card(t), textAlign: 'center' }}>
          <label style={{...lbl(t), textAlign: 'left'}}>Upload File (CSV/Excel) *</label>
          <div style={{ 
            border: `2px dashed ${t.border}`, 
            borderRadius: '12px', 
            padding: '40px 20px',
            backgroundColor: t.cardInner,
            marginTop: '12px',
            position: 'relative',
            cursor: 'pointer',
            transition: 'all 200ms ease'
          }}
          onMouseEnter={e => e.currentTarget.style.borderColor = t.accent}
          onMouseLeave={e => e.currentTarget.style.borderColor = t.border}>
            <input 
              type="file" 
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
            />
            {file ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <FileType style={{ width: '32px', height: '32px', color: t.accent }} />
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: t.text }}>{file.name}</p>
                <p style={{ margin: 0, fontSize: '12px', color: t.textMuted }}>{(file.size / 1024).toFixed(1)} KB • Click or drag to change</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <Upload style={{ width: '32px', height: '32px', color: t.textMuted }} />
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: t.text }}>Click to upload or drag and drop</p>
                <p style={{ margin: 0, fontSize: '12px', color: t.textMuted }}>CSV or Excel. Required: Email. Optional: Name, Company, Job Title, Website, Personalization, Custom Subject, Custom Body.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '10px', background: t.coralSoft, border: `1px solid ${t.coral}`, color: t.coral, fontSize: '13px', fontWeight: 500 }}>
          <AlertTriangle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          {error}
        </div>
      )}

      {success && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderRadius: '10px', background: t.greenSoft, border: `1px solid ${t.green}`, color: t.green, fontSize: '13px', fontWeight: 500 }}>
          <CheckCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          {success}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', paddingTop: '10px' }}>
        <button onClick={() => router.push('/dashboard/categories')}
          style={{ padding: '12px 24px', borderRadius: '10px', border: `1px solid ${t.border}`, background: 'transparent', color: t.textSec, fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: t.font }}>
          Cancel
        </button>
        <button onClick={handleCreate} disabled={loading}
          style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', borderRadius: '10px', background: t.accent, color: '#fff', fontSize: '14px', fontWeight: 600, border: 'none', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: t.font }}>
          {loading ? 'Processing...' : 'Create Category & Import'}
        </button>
      </div>
    </div>
  );
}
