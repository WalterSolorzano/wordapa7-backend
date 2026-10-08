/* WordAPA7 — Modal de Diagnóstico de Clasificación IA
   Muestra el razonamiento de la IA (cambios aplicados), la configuración de
   conexión y el historial de solicitudes. */

import React, { useState } from 'react';
import {
  X, Cpu, BrainCircuit, ListChecks, Activity, AlertTriangle,
  ShieldCheck, RefreshCw, Settings2, Server, Cloud, Wand2, Filter,
} from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';

export interface NIMLogItem {
  id: string;
  timestamp: string;
  endpoint: string;
  statusCode: number;
  tokensUsed: number;
  durationMs: number;
  status: 'success' | 'rate_limit' | 'error';
  message: string;
}

interface NIMDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: NIMLogItem[];
  apiKeyPresent: boolean;
}

type Tab = 'reasoning' | 'connection' | 'requests';

const TYPE_LABEL: Record<string, string> = {
  heading: 'Título',
  paragraph: 'Párrafo',
  bullet: 'Lista con viñetas',
  numbered_list: 'Lista numerada',
  block_quote: 'Cita en bloque',
  table: 'Tabla',
  image: 'Figura',
  empty: 'Vacío',
};

const TYPE_COLOR: Record<string, string> = {
  heading: 'var(--accent-primary)',
  paragraph: 'var(--accent-secondary)',
  bullet: 'var(--accent-primary)',
  numbered_list: 'var(--accent-primary)',
  block_quote: 'var(--color-warning)',
  table: 'var(--color-info)',
  image: 'var(--color-success)',
  empty: 'var(--color-text-tertiary)',
};

export const NIMDiagnosticsModal: React.FC<NIMDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  logs,
  apiKeyPresent,
}) => {
  const { apiKey, aiProviderConfig, doc } = useDocStore();
  const [tab, setTab] = useState<Tab>('reasoning');
  const [filterLowConf, setFilterLowConf] = useState(false);

  if (!isOpen) return null;

  // ── Datos de razonamiento desde el documento actual ──
  const allElements = doc?.elements || [];
  const withReasoning = allElements.filter((e) => e.llm_reasoning);
  const lowConf = allElements.filter((e) => e.confidence < 0.85 && e.type !== 'empty');
  const shownList = filterLowConf ? lowConf : withReasoning.length > 0 ? withReasoning : lowConf;
  const mode = apiKey ? 'NVIDIA NIM' : 'Reglas heurísticas';
  const llmChanged = withReasoning.length;

  const tabButton = (id: Tab, label: string, icon: React.ReactNode, badge?: number) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
        padding: '8px 6px', cursor: 'pointer', fontFamily: 'inherit',
        border: 'none', borderBottom: tab === id ? '2px solid var(--accent-primary)' : '2px solid transparent',
        backgroundColor: tab === id ? 'var(--color-accent-soft)' : 'transparent',
        color: tab === id ? 'var(--accent-primary)' : 'var(--color-text-secondary)',
        fontSize: '11px', fontWeight: 600,
      }}
    >
      {icon}
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{
          fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--accent-primary)', color: '#fff', lineHeight: '1.4',
        }}>
          {badge}
        </span>
      )}
    </button>
  );

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--surface-elevated)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '720px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.4), 0 10px 10px -5px rgba(0,0,0,0.2)',
          border: '1px solid var(--border-subtle)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '85vh'
        }}
      >
        {/* Cabecera del Modal */}
        <div
          style={{
            padding: '14px 20px',
            backgroundColor: 'var(--sidebar-bg)',
            color: 'var(--text-main)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backgroundColor: 'var(--color-accent-soft)', color: 'var(--accent-primary)',
            }}>
              <BrainCircuit size={18} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700 }}>
                Diagnóstico de clasificación IA
              </h3>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {mode} · {llmChanged > 0 ? `${llmChanged} elementos con razonamiento IA` : 'Clasificación por reglas heurísticas'}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '4px'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--app-bg)' }}>
          {tabButton('reasoning', 'Cambios y razonamiento', <ListChecks size={13} />, llmChanged || undefined)}
          {tabButton('connection', 'Conexión', <Server size={13} />)}
          {tabButton('requests', 'Solicitudes', <Activity size={13} />, logs.length || undefined)}
        </div>

        {/* ── TAB 1: RAZONAMIENTO ──────────────────────────────────────────── */}
        {tab === 'reasoning' && (
          <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
            {withReasoning.length === 0 && lowConf.length === 0 && (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                <Wand2 size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p style={{ margin: 0 }}>No hay cambios registrados por la IA en esta sesión.</p>
                <span style={{ fontSize: '11px' }}>
                  {apiKey
                    ? 'Usa "Refinar con IA" para que el modelo revise los elementos ambiguos.'
                    : 'Configura una API Key en la pestaña "Conexión" para habilitar el razonamiento IA.'}
                </span>
              </div>
            )}

            {withReasoning.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', margin: 0 }}>
                    Elementos revisados por el modelo ({withReasoning.length})
                  </h4>
                  <button
                    type="button"
                    onClick={() => setFilterLowConf(!filterLowConf)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '10px', fontWeight: 600, cursor: 'pointer',
                      background: filterLowConf ? 'var(--color-accent-soft)' : 'transparent',
                      border: `1px solid ${filterLowConf ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      borderRadius: 'var(--radius-sm)', padding: '3px 8px', fontFamily: 'inherit',
                      color: filterLowConf ? 'var(--accent-primary)' : 'var(--color-text-secondary)',
                    }}
                  >
                    <Filter size={11} /> Solo baja confianza
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shownList.map((e) => (
                    <div
                      key={e.id}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--color-bg-surface)',
                        fontSize: '11px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                          <span style={{
                            padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, flexShrink: 0,
                            backgroundColor: 'var(--color-accent-soft)',
                            color: TYPE_COLOR[e.type] || 'var(--color-text-secondary)',
                          }}>
                            {TYPE_LABEL[e.type] || e.type}
                          </span>
                          <span style={{
                            fontSize: '10px', fontWeight: 600, flexShrink: 0,
                            color: e.confidence >= 0.85 ? 'var(--color-success)' : 'var(--color-warning)',
                          }}>
                            {Math.round(e.confidence * 100)}%
                          </span>
                          {e.needs_review && (
                            <span style={{
                              display: 'inline-flex', alignItems: 'center', gap: '3px',
                              fontSize: '9px', fontWeight: 600, color: 'var(--color-warning)',
                              padding: '1px 6px', borderRadius: 'var(--radius-full)', backgroundColor: 'rgba(250,173,20,0.12)',
                              flexShrink: 0,
                            }}>
                              <AlertTriangle size={9} /> Revisión
                            </span>
                          )}
                        </div>
                      </div>

                      {e.text && (
                        <div style={{
                          fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 600,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {e.text.length > 90 ? e.text.slice(0, 90) + '…' : e.text}
                        </div>
                      )}

                      {e.llm_reasoning && (
                        <div style={{
                          display: 'flex', gap: '6px', alignItems: 'flex-start',
                          fontSize: '11px', color: 'var(--color-text-secondary)', lineHeight: 1.5,
                        }}>
                          <ShieldCheck size={12} style={{ marginTop: 2, flexShrink: 0, color: 'var(--accent-primary)' }} />
                          <span style={{ fontStyle: 'italic' }}>{e.llm_reasoning}</span>
                        </div>
                      )}

                      {e.pre_classifier_rule && !e.llm_reasoning && (
                        <div style={{
                          display: 'flex', gap: '6px', alignItems: 'flex-start',
                          fontSize: '11px', color: 'var(--color-text-tertiary)', lineHeight: 1.5,
                        }}>
                          <Filter size={12} style={{ marginTop: 2, flexShrink: 0 }} />
                          <span>Regla heurística: <code style={{ fontSize: '10px' }}>{e.pre_classifier_rule}</code></span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {withReasoning.length === 0 && lowConf.length > 0 && (
              <>
                <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                  Elementos con confianza baja (sin razonamiento IA)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {lowConf.map((e) => (
                    <div key={e.id} style={{
                      padding: '10px 12px', borderRadius: '10px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--color-bg-surface)', fontSize: '11px',
                      display: 'flex', flexDirection: 'column', gap: '6px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 700,
                          backgroundColor: 'var(--color-accent-soft)',
                          color: TYPE_COLOR[e.type] || 'var(--color-text-secondary)',
                        }}>
                          {TYPE_LABEL[e.type] || e.type}
                        </span>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-warning)' }}>
                          {Math.round(e.confidence * 100)}%
                        </span>
                      </div>
                      <div style={{
                        fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 600,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {e.text && (e.text.length > 90 ? e.text.slice(0, 90) + '…' : e.text)}
                      </div>
                      {e.pre_classifier_rule && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                          Regla heurística: <code style={{ fontSize: '10px' }}>{e.pre_classifier_rule}</code>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB 2: CONEXIÓN ──────────────────────────────────────────────── */}
        {tab === 'connection' && (
          <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 12px 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Server size={14} /> Configuración de Conexión
            </h4>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'default', color: 'var(--text-main)' }}>
                <input type="radio" checked={!aiProviderConfig.useLocal} readOnly />
                <Cloud size={14} color={!aiProviderConfig.useLocal ? 'var(--accent-primary)' : 'var(--text-muted)'} /> NVIDIA NIM Cloud
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'default', color: 'var(--text-main)' }}>
                <input type="radio" checked={aiProviderConfig.useLocal} readOnly />
                <Server size={14} color={aiProviderConfig.useLocal ? 'var(--color-success)' : 'var(--text-muted)'} /> Servidor Local
              </label>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
              padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
              backgroundColor: 'var(--surface-subtle)', marginBottom: '16px', lineHeight: 1.5,
            }}>
              {apiKey ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-success)', fontWeight: 600 }}>
                  <ShieldCheck size={14} /> Clave de IA configurada
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--color-warning)', fontWeight: 600 }}>
                  <AlertTriangle size={14} /> Sin clave: se usará el modo Reglas (heurístico)
                </span>
              )}
              {aiProviderConfig.useLocal && aiProviderConfig.nimUrl && (
                <span style={{ color: 'var(--text-secondary)' }}>· {aiProviderConfig.nimUrl}</span>
              )}
            </div>

            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '0 0 12px', lineHeight: 1.5 }}>
              Las claves y el proveedor se gestionan en un solo lugar (Ajustes → Conexión), no acá.
            </p>
            <button
              type="button"
              onClick={() => useDocStore.getState().setSettingsHubOpen(true, 'conexion')}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' }}
            >
              <Settings2 size={13} /> Configurar claves en Ajustes
            </button>
          </div>
        )}

        {/* ── TAB 3: SOLICITUDES ───────────────────────────────────────────── */}
        {tab === 'requests' && (
          <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginTop: 0, marginBottom: '10px' }}>
              Historial de Solicitudes Recientes ({logs.length})
            </h4>

            {logs.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                <Activity size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <p style={{ margin: 0 }}>No hay llamadas registradas aún en esta sesión.</p>
                <span style={{ fontSize: '11px' }}>Haz clic en "Refinar con IA" para enviar lotes ambiguos.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {logs.map((log) => (
                  <div
                    key={log.id}
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: log.status === 'success' ? 'rgba(82,196,26,0.1)' : log.status === 'rate_limit' ? 'rgba(250,173,20,0.1)' : 'rgba(255,77,79,0.1)',
                      fontSize: '11px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ color: 'var(--text-main)' }}>{log.endpoint}</strong>
                      <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{log.timestamp}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', color: 'var(--text-secondary)' }}>
                      <span>Estado: <strong>{log.statusCode}</strong></span>
                      <span>Tokens: <strong>{log.tokensUsed}</strong></span>
                      <span>Duración: <strong>{log.durationMs}ms</strong></span>
                    </div>
                    <p style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                      {log.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pie de Modal */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--app-bg)'
          }}
        >
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Cpu size={12} /> Cola por lotes asíncrona
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ fontSize: '12px' }}>
            Cerrar Diagnóstico
          </button>
        </div>
      </div>
    </div>
  );
};

export default NIMDiagnosticsModal;
