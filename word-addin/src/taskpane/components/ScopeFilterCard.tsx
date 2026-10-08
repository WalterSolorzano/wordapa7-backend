/* WordAPA7 add-in — Filtro de alcances: "Pasar a APA" con garantía.
   El usuario elige QUÉ se toca; lo demás queda EXACTAMENTE igual. */

import React, { useState } from 'react'
import { backend } from '../api/backend'
import { getDocumentOoxml, downloadBase64File } from '../office/wordHelper'

type ToastTone = 'info' | 'error' | 'success' | 'warning'

const SCOPES = [
  { id: 'texto', label: 'Texto', desc: 'Tipografía, interlineado y sangría' },
  { id: 'tablas_imagenes', label: 'Tablas e imágenes', desc: 'Numeración Tabla N / Figura N' },
  { id: 'bibliografia', label: 'Bibliografía', desc: 'Sangría francesa y espaciado' },
]

export const ScopeFilterCard: React.FC<{ showToast?: (msg: string, tone?: ToastTone) => void }> = ({ showToast }) => {
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ pdfAvailable: boolean } | null>(null)

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  React.useEffect(() => {
    const p = localStorage.getItem('wordapa7_quick_open');
    if (!p) return;
    try { localStorage.setItem('wordapa7_quick_open_path', p) } catch {}
    localStorage.removeItem('wordapa7_quick_open');
    fetch('http://127.0.0.1:8742/api/open-local', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: p }) })
      .then(r => r.json())
      .then(d => { if (d?.session_id) showToast?.('Documento cargado. Elige qu? corregir.', 'info'); })
      .catch(() => { setLoadFailed(true); showToast?.('No se pudo cargar el documento', 'error') });
  }, []); // eslint-disable-line

const [loadFailed, setLoadFailed] = React.useState(false)

const reopenInWord = async () => {
    const p = localStorage.getItem('wordapa7_quick_open_path')
    if (!p) return
    try {
      await fetch('http://127.0.0.1:8742/api/open-in-word', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: p }) })
      showToast?.('Abierto en Word', 'success')
    } catch { showToast?.('Necesitas la app WordAPA7 abierta', 'error') }
  }

const apply = async () => {
    try { (window as any).clearQuickFlag?.() } catch {}
    try { localStorage.removeItem('wordapa7_addin_quick') } catch {}
    if (busy || selected.length === 0) return
    setBusy(true)
    setDone(null)
    try {
      const ooxml = await getDocumentOoxml()
      const res = await backend.scopedApplyLive(btoa(unescape(encodeURIComponent(ooxml))), selected)
      downloadBase64File(res.docx_base64, 'Documento_APA_por_alcances.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      setDone({ pdfAvailable: !!res.pdf_base64 })
      showToast?.('Aplicado. Se descargó el documento procesado.', 'success')
    } catch (e) {
      showToast?.(`No se pudo aplicar: ${String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  const exportPdf = async () => {
    if (busy) return
    setBusy(true)
    try {
      const ooxml = await getDocumentOoxml()
      // PDF siempre parte del DOCX YA PROCESADO por los mismos alcances.
      const res = await backend.scopedApplyLive(btoa(unescape(encodeURIComponent(ooxml))), selected)
      if (res.pdf_base64) {
        downloadBase64File(res.pdf_base64, 'Documento_APA.pdf', 'application/pdf')
        showToast?.('PDF descargado', 'success')
      } else {
        showToast?.('PDF no disponible en este momento', 'warning')
      }
    } catch (e) {
      showToast?.(`Error generando PDF: ${String(e)}`, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="action-card" style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Pasar a APA por partes</div>
      <div style={{ fontSize: 11.5, opacity: 0.75, marginBottom: 10, lineHeight: 1.45 }}>
        Elige qué modificamos del documento. Lo que no marques no se toca.
      </div>

      {SCOPES.map((s) => {
        const on = selected.includes(s.id)
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            style={{
              width: '100%', textAlign: 'left', marginBottom: 6, cursor: 'pointer',
              fontFamily: 'inherit', padding: '8px 11px', borderRadius: 8,
              border: `1px solid ${on ? 'var(--accent-primary)' : 'var(--border-subtle, #d4d4d8)'}`,
              background: on ? 'var(--surface-subtle, #eef2ff)' : 'var(--surface, #fff)',
            }}
          >
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: on ? 'var(--accent-primary)' : 'var(--text-main, #18181b)' }}>
              {s.label}{on ? ' ' : ''}
            </span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted, #71717a)' }}>{s.desc}</span>
          </button>
        )
      })}

      <button
        type="button"
        disabled={selected.length === 0 || busy}
        onClick={apply}
        className="btn-primary-full"
        style={{
          width: '100%', marginTop: 8, padding: '9px 12px', borderRadius: 8,
          background: 'var(--accent-primary)', color: 'var(--surface, #fff)', fontWeight: 700, fontSize: 13,
          border: 'none', cursor: selected.length === 0 || busy ? 'wait' : 'pointer',
          opacity: selected.length === 0 && !busy ? 0.5 : 1,
        }}
      >
        {busy ? 'Procesando…' : `Aplicar (${selected.length}) y descargar Word`}
      </button>

      {done && (
        <button
          type="button"
          onClick={exportPdf}
          disabled={busy}
          style={{
            width: '100%', marginTop: 6, padding: '8px 12px', borderRadius: 8,
            background: 'transparent', color: 'var(--accent-primary)', fontWeight: 600, fontSize: 12.5,
            border: '1px solid var(--accent-primary)', cursor: 'pointer',
          }}
        >
          También quiero el PDF
        </button>
      )}
    </div>
  )
}

export default ScopeFilterCard
