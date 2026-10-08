import React, { useEffect, useState } from 'react';
import { Activity, Server, Settings } from 'lucide-react';
import { getApiBase } from '../api/backend';
import { useDocStore } from '../store/useDocStore';

type AIHealthStatus = 'good' | 'warning' | 'critical';

interface SpecialtyHealth {
  provider: string;
  percentage: number;
  status: AIHealthStatus;
}

interface AIHealthResponse {
  [specialty: string]: SpecialtyHealth;
}

const SignalBars = ({ percentage, status }: { percentage: number, status: AIHealthStatus }) => {
  // Calculamos cuantas barras encender (0 a 4)
  const activeBars = Math.ceil((percentage / 100) * 4);

  const getColor = (isActive: boolean, stat: AIHealthStatus): string => {
    if (!isActive) return 'var(--color-border-strong)';
    if (stat === 'critical') return 'var(--color-danger)';
    if (stat === 'warning') return 'var(--color-warning)';
    return 'var(--accent-primary)';
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '16px' }}>
      {[1, 2, 3, 4].map((bar) => (
        <div
          key={bar}
          style={{
            width: '6px', borderRadius: '2px',
            backgroundColor: getColor(bar <= activeBars, status),
            height: bar === 1 ? '6px' : bar === 2 ? '10px' : bar === 3 ? '14px' : '16px',
            transition: 'background-color 500ms ease',
            ...(bar <= activeBars && status === 'critical' ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
          }}
        />
      ))}
    </div>
  );
};

export const AIBatteryIndicator: React.FC = () => {
  const [health, setHealth] = useState<AIHealthResponse | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const { setSettingsHubOpen, setIsNIMDiagnosticsOpen } = useDocStore();

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch(`${getApiBase()}/ai/health`);
        if (res.ok) {
          const data = await res.json();
          setHealth(data);
        }
      } catch (err) {
        console.error("No se pudo obtener el estado de IA");
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 15000); // Polling cada 15s
    return () => clearInterval(interval);
  }, []);

  if (!health) return null;

  // Calculamos el estado global (el peor de todos)
  const specialties = Object.values(health);
  const isCritical = specialties.some(s => s.status === 'critical');
  const isWarning = specialties.some(s => s.status === 'warning');

  const globalStatus = isCritical ? 'critical' : (isWarning ? 'warning' : 'good');
  const statusColor =
    globalStatus === 'critical' ? 'var(--color-danger)' :
    globalStatus === 'warning' ? 'var(--color-warning)' : 'var(--accent-primary)';
  const glowShadow =
    globalStatus === 'critical'
      ? '0 0 16px color-mix(in srgb, var(--color-danger) 40%, transparent)'
      : globalStatus === 'warning'
      ? '0 0 16px color-mix(in srgb, var(--color-warning) 30%, transparent)'
      : 'var(--shadow-md)';

  // Al hacer clic: la pestaña Conexión del hub, que es donde se eligen
  // proveedor, modelo y claves. Antes apuntaba a la pestaña 'ai' de un estudio
  // que ya no existe, así que el clic no tenía destino.
  const handleClick = () => {
    setSettingsHubOpen(true, 'conexion');
  };

  return (
    <div
      style={{ position: 'fixed', bottom: '16px', left: '16px', zIndex: 9999, display: 'flex', alignItems: 'flex-end' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <style>{`@keyframes ai-battery-ping { 0% { transform: scale(1); opacity: 0.6; } 75%, 100% { transform: scale(1.8); opacity: 0; } }`}</style>

      {/* Panel Detallado (Hover) */}
      <div
        style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          marginBottom: '12px',
          width: '280px',
          backgroundColor: 'var(--surface-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px',
          boxShadow: 'var(--shadow-card)',
          color: 'var(--text-main)',
          transition: 'opacity 300ms ease, transform 300ms ease',
          transformOrigin: 'bottom left',
          opacity: isHovered ? 1 : 0,
          transform: isHovered ? 'scale(1) translateY(0)' : 'scale(0.95) translateY(8px)',
          pointerEvents: isHovered ? 'auto' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
          <Server size={16} color="var(--text-secondary)" />
          <h4 style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Estado de Red IA
          </h4>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {Object.entries(health).map(([specialty, data]) => (
            <div key={specialty} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 500, color: 'var(--text-main)' }}>
                  {specialty === 'FAST' ? 'Corrector Rapido' : specialty === 'HEAVY' ? 'Analizador Profundo' : 'Motor Logico'}
                </p>
                <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
                  {data.provider}
                </p>
              </div>
              <SignalBars percentage={data.percentage} status={data.status} />
            </div>
          ))}
        </div>

        {/* Boton de accion: abrir configuracion de IA */}
        <button
          type="button"
          onClick={handleClick}
          style={{
            marginTop: '12px',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 12px',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--color-accent-soft)',
            color: 'var(--accent-primary)',
            fontFamily: 'inherit',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-primary)'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--color-accent-soft)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent-primary)'; }}
        >
          <Settings size={13} /> Configurar IA
        </button>
      </div>

      {/* Icono Principal — clicable */}
      <div
        onClick={handleClick}
        role="button"
        aria-label="Configurar estado de IA"
        title="Clic para configurar IA · Pasa el cursor para ver el estado"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--surface-elevated)',
          border: '1px solid var(--border-subtle)',
          boxShadow: glowShadow,
          cursor: 'pointer',
          transition: 'transform 200ms ease',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
      >
        {globalStatus === 'critical' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'var(--radius-full)',
              backgroundColor: 'color-mix(in srgb, var(--color-danger) 20%, transparent)',
              animation: 'ai-battery-ping 3s cubic-bezier(0, 0, 0.2, 1) infinite',
            }}
          />
        )}
        <Activity size={20} style={{ color: statusColor, transition: 'color 500ms ease' }} />
      </div>
    </div>
  );
};
