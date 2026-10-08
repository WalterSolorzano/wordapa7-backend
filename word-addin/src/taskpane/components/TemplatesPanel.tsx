import React, { useState } from 'react'
import { BookOpenIcon, FileTextIcon, CheckCircleIcon, ZapIcon } from './Icons'

interface Props {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void
}

interface AcademicTemplate {
  id: string
  title: string
  category: string
  description: string
  pagesEstimate: string
  structure: string[]
  content: {
    title: string
    sections: Array<{ heading: string; level: 1 | 2; text: string }>
  }
}

const TEMPLATES: AcademicTemplate[] = [
  {
    id: 'tesis',
    title: 'Tesis de Grado / Proyecto de Titulación',
    category: 'Tesis Universitaria',
    description: '5 capítulos reglamentarios: portada, índice, marco teórico, metodología, resultados y referencias.',
    pagesEstimate: '30-80 páginas',
    structure: [
      'Portada Institucional',
      'Resumen / Abstract',
      'Capítulo I: Introducción y Objetivos',
      'Capítulo II: Marco Teórico y Antecedentes',
      'Capítulo III: Metodología y Muestra',
      'Capítulo IV: Resultados y Análisis',
      'Capítulo V: Conclusiones y Recomendaciones',
      'Referencias APA 7',
    ],
    content: {
      title: 'Título de la Tesis de Grado en Formato APA 7',
      sections: [
        { heading: 'Resumen', level: 1, text: 'El presente trabajo de investigación analiza la optimización de procesos mediante metodologías estandarizadas. Se utilizó un diseño cuantitativo descriptivo con una muestra representativa. Los resultados indican mejoras estadísticamente significativas en el rendimiento operacional.' },
        { heading: 'Capítulo I. Introducción', level: 1, text: 'En el contexto académico actual, la estandarización de procesos constituye una prioridad fundamental para la eficiencia operativa.' },
        { heading: '1.1. Planteamiento del Problema', level: 2, text: 'La problemática central radica en la variabilidad de tiempos de ciclo y la necesidad de optimización de recursos.' },
        { heading: '1.2. Objetivos de la Investigación', level: 2, text: 'Objetivo General: Desarrollar un modelo integral de optimización de procesos. Objetivos Específicos: Diagnosticar la situación actual y diseñar el plan de mejora continua.' },
        { heading: 'Capítulo II. Marco Teórico', level: 1, text: 'A continuación se presentan los fundamentos conceptuales y antecedentes de investigación relevantes para el estudio.' },
        { heading: '2.1. Antecedentes del Estudio', level: 2, text: 'Diversos autores han demostrado la correlación positiva entre la estandarización y el desempeño productivo (González, 2021; Smith & Jones, 2022).' },
        { heading: 'Capítulo III. Metodología', level: 1, text: 'El estudio adopta un enfoque cuantitativo con alcance descriptivo y correlacional.' },
        { heading: '3.1. Población y Muestra', level: 2, text: 'La población estuvo compuesta por las operaciones del período 2024-2025, seleccionando una muestra probabilística de n = 60 observaciones.' },
        { heading: 'Capítulo IV. Resultados y Discusión', level: 1, text: 'Los hallazgos principales evidencian incrementos notables en la productividad tras la implementación de las mejoras propuestas.' },
        { heading: 'Capítulo V. Conclusiones', level: 1, text: 'Se concluye que la aplicación del marco metodológico propuesto optimiza de manera sostenible las variables operativas analizadas.' },
        { heading: 'Referencias', level: 1, text: 'González, M. (2021). Metodología de la investigación aplicada a la ingeniería. Editorial Académica.\nSmith, J., & Jones, R. (2022). Process optimization in modern industry. Journal of Operations Management, 45(3), 112–128. https://doi.org/10.1016/j.jom.2022.01.004' },
      ],
    },
  },
  {
    id: 'paper',
    title: 'Artículo Científico / Paper de Investigación',
    category: 'Publicación Científica',
    description: 'Estructura IMRyD (Introducción, Método, Resultados y Discusión) para revistas indexadas y congresos académicos.',
    pagesEstimate: '8-15 páginas',
    structure: [
      'Título y Afiliación',
      'Abstract y Palabras Clave',
      '1. Introducción',
      '2. Método y Materiales',
      '3. Resultados',
      '4. Discusión',
      'Referencias Bibliográficas',
    ],
    content: {
      title: 'Análisis Experimental de Optimización de Procesos en Entornos de Producción',
      sections: [
        { heading: 'Abstract', level: 1, text: 'This paper presents an empirical analysis of operational optimization methodologies. A controlled quasi-experimental design was conducted across industrial workflows. Results demonstrate significant reductions in cycle time variance.' },
        { heading: '1. Introducción', level: 1, text: 'La literatura reciente destaca la importancia de la mejora continua y el control estadístico de procesos en organizaciones contemporáneas.' },
        { heading: '2. Método', level: 1, text: 'Se diseñó un experimento controlado con dos grupos: grupo control (n = 30) y grupo experimental (n = 30) sometido a la nueva metodología.' },
        { heading: '3. Resultados', level: 1, text: 'El análisis inferencial mediante prueba t de Student arrojó diferencias estadísticamente significativas (t = 4.32, p < 0.001) a favor del grupo experimental.' },
        { heading: '4. Discusión', level: 1, text: 'Los resultados concuerdan con los hallazgos de investigaciones previas en el área de ingeniería industrial y gestión operativa.' },
        { heading: 'Referencias', level: 1, text: 'Hernández, R., & Fernández, C. (2020). Metodología de la investigación científica (6.ª ed.). McGraw-Hill Education.\nWilliams, K. (2023). Statistical methods in experimental research. Academic Press.' },
      ],
    },
  },
  {
    id: 'ensayo',
    title: 'Ensayo Académico Universitario',
    category: 'Trabajo de Curso',
    description: 'Formato estándar para ensayos, monografías y trabajos de curso con portada estudiantil y desarrollo temático argumentativo.',
    pagesEstimate: '4-8 páginas',
    structure: [
      'Portada Estudiantil',
      'Introducción con Tesis',
      'Desarrollo Argumentativo (3 Ejes)',
      'Conclusión Integradora',
      'Lista de Referencias',
    ],
    content: {
      title: 'Perspectivas Contemporáneas sobre la Transformación Digital y la Ética',
      sections: [
        { heading: 'Introducción', level: 1, text: 'La transformación digital ha reconfigurado los paradigmas éticos y organizacionales de la sociedad contemporánea.' },
        { heading: 'Desarrollo Temático', level: 1, text: 'El análisis de la tecnología requiere una postura reflexiva que pondere tanto la innovación como la responsabilidad social.' },
        { heading: 'Eje 1: Impacto en el Empleo', level: 2, text: 'La automatización de procesos genera oportunidades de reconversión laboral pero exige políticas activas de capacitación continua.' },
        { heading: 'Eje 2: Privacidad de Datos y Transparencia', level: 2, text: 'La gestión ética de la información personal es un imperativo legal y moral ineludible en la era digital.' },
        { heading: 'Conclusión', level: 1, text: 'En conclusión, el avance tecnológico debe orientarse hacia el bienestar humano y la equidad social.' },
        { heading: 'Referencias', level: 1, text: 'Castells, M. (2019). La era de la información: economía, sociedad y cultura. Alianza Editorial.\nZuboff, S. (2021). La era del capitalismo de la vigilancia. Paidós.' },
      ],
    },
  },
]

export const TemplatesPanel: React.FC<Props> = ({ showToast }) => {
  const [selectedId, setSelectedId] = useState<string>('tesis')
  const [inserting, setInserting] = useState(false)

  const selectedTemplate = TEMPLATES.find((t) => t.id === selectedId) || TEMPLATES[0]

  const handleInsertTemplate = async () => {
    setInserting(true)
    try {
      await Word.run(async (context) => {
        const body = context.document.body

        // Título Principal
        const pTitle = body.insertParagraph(selectedTemplate.content.title, Word.InsertLocation.end)
        pTitle.font.name = 'Times New Roman'
        pTitle.font.size = 12
        pTitle.font.bold = true
        pTitle.font.italic = false
        pTitle.alignment = Word.Alignment.centered
        pTitle.lineSpacing = 24
        pTitle.leftIndent = 0
        pTitle.firstLineIndent = 0
        pTitle.spaceBefore = 12
        pTitle.spaceAfter = 18

        for (const sec of selectedTemplate.content.sections) {
          const isH1 = sec.level === 1
          const isRefs = sec.heading.toLowerCase().includes('referencia')

          // Heading
          const pH = body.insertParagraph(sec.heading, Word.InsertLocation.end)
          pH.font.name = 'Times New Roman'
          pH.font.size = 12
          pH.font.bold = true
          pH.font.italic = !isH1
          pH.alignment = isH1 ? Word.Alignment.centered : Word.Alignment.left
          pH.lineSpacing = 24
          pH.leftIndent = 0
          pH.firstLineIndent = 0
          pH.spaceBefore = isH1 ? 18 : 12
          pH.spaceAfter = 6

          // Body text
          const lines = sec.text.split('\n')
          for (const line of lines) {
            const pText = body.insertParagraph(line, Word.InsertLocation.end)
            pText.font.name = 'Times New Roman'
            pText.font.size = 12
            pText.font.bold = false
            pText.font.italic = false
            pText.alignment = Word.Alignment.left
            pText.lineSpacing = 24
            pText.spaceBefore = 0
            pText.spaceAfter = 0

            if (isRefs) {
              // Sangría francesa
              pText.leftIndent = 36
              pText.firstLineIndent = -36
            } else {
              // Sangría de primera línea
              pText.leftIndent = 0
              pText.firstLineIndent = 36
            }
          }
        }
        await context.sync()
      })
      showToast(`Plantilla "${selectedTemplate.title}" insertada en Word con éxito`, 'success')
    } catch (err: any) {
      showToast(err.message || 'Error al insertar plantilla en Word', 'error')
    } finally {
      setInserting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* HEADER CARD */}
      <div className="card card--hero">
        <div className="card__header">
          <div className="card__title">
            <FileTextIcon size={16} color="var(--accent-primary)" />
            <span>Biblioteca de Plantillas APA 7</span>
          </div>
        </div>

        <p className="card__subtitle">
          Elige una estructura y se inserta lista en tu documento.
        </p>

        {/* SELECTOR DE PLANTILLAS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
          {TEMPLATES.map((t) => {
            const isSel = selectedId === t.id
            return (
              <div
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  border: isSel ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  background: isSel ? 'var(--accent-soft, #f0f4ff)' : 'var(--surface, #ffffff)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: isSel ? 'var(--accent-primary)' : 'var(--text-main)' }}>
                    {t.title}
                  </span>
                  <span className="finding-item__badge finding-item__badge--info">
                    {t.category}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  {t.description}
                </span>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleInsertTemplate}
          disabled={inserting}
          style={{ marginTop: 8 }}
        >
          <ZapIcon size={14} color="#ffffff" />
          <span>{inserting ? 'Insertando en Word...' : 'Insertar Plantilla Seleccionada en Word'}</span>
        </button>
      </div>

      {/* DETALLES DE LA ESTRUCTURA */}
      <div className="card">
        <div className="card__header">
          <div className="card__title">Estructura Incluida</div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {selectedTemplate.pagesEstimate}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {selectedTemplate.structure.map((s, idx) => (
            <div key={idx} style={{ fontSize: 11.5, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>✓</span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
