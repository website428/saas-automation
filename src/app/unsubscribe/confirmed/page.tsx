export default function UnsubscribeConfirmed() {
    return (
        <main style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Arial, sans-serif',
            background: '#f9f9f9',
            color: '#333',
            padding: '40px 20px',
            textAlign: 'center',
        }}>
            <div style={{
                background: '#fff',
                borderRadius: '12px',
                padding: '48px 40px',
                boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
                maxWidth: '480px',
                width: '100%',
            }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
                <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '12px' }}>
                    You&apos;ve been unsubscribed
                </h1>
                <p style={{ fontSize: '15px', color: '#666', lineHeight: 1.6 }}>
                    You&apos;ve been successfully removed from this mailing list.
                    You won&apos;t receive any further emails from us.
                </p>
                <p style={{ fontSize: '13px', color: '#aaa', marginTop: '24px' }}>
                    If this was a mistake, please contact the sender directly.
                </p>
            </div>
        </main>
    );
}
