import os
import matplotlib
import matplotlib.pyplot as plt
import matplotlib.font_manager as fm
import numpy as np
import reportlab.platypus as rl
import reportlab.lib.units as u
import reportlab.lib.colors as c
import reportlab.lib.enums as ea
import reportlab.lib.pagesizes as ps
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                               Image, KeepTogether, HRFlowable)
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.pdfmetrics import registerFontFamily
from reportlab.lib import colors

FONT_DIR = '/usr/share/fonts'

# ── Register Fonts ──
pdfmetrics.registerFont(TTFont('FreeSerif', f'{FONT_DIR}/truetype/freefont/FreeSerif.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Bold', f'{FONT_DIR}/truetype/freefont/FreeSerifBold.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-Italic', f'{FONT_DIR}/truetype/freefont/FreeSerifItalic.ttf'))
pdfmetrics.registerFont(TTFont('FreeSerif-BoldItalic', f'{FONT_DIR}/truetype/freefont/FreeSerifBoldItalic.ttf'))
pdfmetrics.registerFont(TTFont('DejaVuSans', f'{FONT_DIR}/truetype/dejavu/DejaVuSansMono.ttf'))
registerFontFamily('FreeSerif', normal='FreeSerif', bold='FreeSerif-Bold',
                   italic='FreeSerif-Italic', boldItalic='FreeSerif-BoldItalic')

# ── Cascade Palette ──
TABLE_STRIPE = c.HexColor('#eeedea')
HEADER_FILL = c.HexColor('#4c4637')
BORDER      = c.HexColor('#cbc8be')
ACCENT      = c.HexColor('#8b7226')
ACCENT_2    = c.HexColor('#3e97b4')
TEXT_PRIMARY = c.HexColor('#1c1b19')
TEXT_MUTED   = c.HexColor('#7a7770')
SEM_SUCCESS = c.HexColor('#477858')
SEM_ERROR   = c.HexColor('#9f4840')
SEM_INFO    = c.HexColor('#547291')
SEM_WARNING = c.HexColor('#9b814f')

# ── Output paths ──
OUT_DIR = '/home/z/my-project/download'
CHART_PATH = os.path.join(OUT_DIR, 'pie_chart.png')
PDF_PATH = os.path.join(OUT_DIR, 'Balance_de_Agua_Restaurante.pdf')

# ══════════════════════════════════════════════════════════════════════
# GENERATE PIE CHART
# ══════════════════════════════════════════════════════════════════════
fm.fontManager.addfont('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
plt.rcParams['font.sans-serif'] = ['DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

labels = ['Clientes', 'Empleados', 'Cocina', 'Limpieza', 'Sanitarios', 'Riego']
values = [900, 225, 360, 240, 300, 180]
pcts = [v / 2205 * 100 for v in values]
CHART_COLORS = ['#3e97b4', '#8b7226', '#477858', '#9f4840', '#547291', '#9b814f']

fig, ax = plt.subplots(figsize=(7, 5), constrained_layout=True)
wedges, texts, autotexts = ax.pie(
    values, labels=None, autopct='', startangle=140,
    colors=CHART_COLORS[:6], pctdistance=0.75,
    wedgeprops=dict(width=0.45, edgecolor='white', linewidth=2.5))
ax.legend(
    wedges, [f'{l} ({p:.1f}%)' for l, p in zip(labels, pcts)],
    loc='center left', bbox_to_anchor=(0.92, 0.5), fontsize=9,
    frameon=True, fancybox=True, shadow=False,
    edgecolor='#cbc8be')
ax.set_title('Distribucion del Consumo de Agua por Componente',
              fontsize=12, fontweight='bold', color='#1c1b19', pad=15)
center_circle = plt.Circle((0, 0), 0.35, fc='white', ec='#cbc8be', lw=1.5)
ax.add_artist(center_circle)
ax.text(0, 0.04, '2,205', ha='center', va='center', fontsize=18,
        fontweight='bold', color='#1c1b19')
ax.text(0, -0.12, 'm\u00b3/ano', ha='center', va='center', fontsize=9,
        color='#7a7770')
plt.savefig(CHART_PATH, dpi=250, bbox_inches='tight', facecolor='white', edgecolor='none')
plt.close()
print(f'Chart saved: {CHART_PATH}')

# ══════════════════════════════════════════════════════════════════════
# STYLES
# ══════════════════════════════════════════════════════════════════════
page_n = [0]
def add_page_number(canvas, doc):
    page_n[0] += 1
    if page_n[0] > 1:
        canvas.saveState()
        canvas.setFont('FreeSerif', 9)
        canvas.setFillColor(TEXT_MUTED)
        canvas.drawCentredString(ps.A4[0] / 2, 1.5 * u.cm, str(page_n[0]))
        canvas.restoreState()

title_s = ParagraphStyle('Title', fontName='FreeSerif-Bold', fontSize=14, leading=18,
    alignment=ea.TA_CENTER, spaceAfter=4, textColor=TEXT_PRIMARY)
sub_s = ParagraphStyle('Sub', fontName='FreeSerif', fontSize=11, leading=15,
    alignment=ea.TA_CENTER, spaceAfter=18, textColor=TEXT_MUTED)
h1 = ParagraphStyle('H1', fontName='FreeSerif-Bold', fontSize=13, leading=17,
    spaceBefore=18, spaceAfter=8, textColor=TEXT_PRIMARY)
h2 = ParagraphStyle('H2', fontName='FreeSerif-Bold', fontSize=11.5, leading=15,
    spaceBefore=14, spaceAfter=6, textColor=TEXT_PRIMARY)
body = ParagraphStyle('Body', fontName='FreeSerif', fontSize=11, leading=16,
    alignment=ea.TA_JUSTIFY, spaceAfter=6, textColor=TEXT_PRIMARY,
    firstLineIndent=1.27*u.cm)
eq_s = ParagraphStyle('Eq', fontName='FreeSerif', fontSize=11, leading=17,
    alignment=ea.TA_CENTER, spaceAfter=4, spaceBefore=4, textColor=TEXT_PRIMARY,
    leftIndent=1.5*u.cm)
cap_s = ParagraphStyle('Cap', fontName='FreeSerif-Italic', fontSize=10, leading=13,
    alignment=ea.TA_CENTER, spaceBefore=3, spaceAfter=6, textColor=TEXT_MUTED)
hc = ParagraphStyle('HC', fontName='FreeSerif-Bold', fontSize=10, leading=13,
    alignment=ea.TA_CENTER, textColor=colors.white)
cs = ParagraphStyle('CS', fontName='FreeSerif', fontSize=10, leading=13,
    alignment=ea.TA_CENTER, textColor=TEXT_PRIMARY)
cl = ParagraphStyle('CL', fontName='FreeSerif', fontSize=10, leading=13,
    alignment=ea.TA_LEFT, textColor=TEXT_PRIMARY)
ref_s = ParagraphStyle('Ref', fontName='FreeSerif', fontSize=10, leading=14,
    alignment=ea.TA_LEFT, spaceAfter=4, textColor=TEXT_PRIMARY,
    leftIndent=1.27*u.cm, firstLineIndent=-1.27*u.cm)

# ── Helpers ──
M3 = 'm<super>3</super>'
def P(t, s=body): return Paragraph(t, s)
def H1(t): return Paragraph(f'<b>{t}</b>', h1)
def H2(t): return Paragraph(f'<b>{t}</b>', h2)
def Eq(t): return Paragraph(t, eq_s)

def tbl(data, cw, nhr=1):
    t = Table(data, colWidths=cw, hAlign='CENTER')
    cmds = [
        ('BACKGROUND', (0, 0), (-1, nhr-1), HEADER_FILL),
        ('TEXTCOLOR', (0, 0), (-1, nhr-1), colors.white),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]
    for i in range(nhr, len(data)):
        bg = colors.white if (i - nhr) % 2 == 0 else TABLE_STRIPE
        cmds.append(('BACKGROUND', (0, i), (-1, i), bg))
    t.setStyle(TableStyle(cmds))
    return t

# ══════════════════════════════════════════════════════════════════════
# BUILD PDF
# ══════════════════════════════════════════════════════════════════════
doc = SimpleDocTemplate(PDF_PATH, pagesize=ps.A4,
    leftMargin=2.54*u.cm, rightMargin=2.54*u.cm,
    topMargin=2.54*u.cm, bottomMargin=2.54*u.cm)
aw = doc.width
story = []

# ── TITLE (APA 7) ──
story.append(P('<b>Balance de Agua de un Restaurante</b>', title_s))
story.append(P('Trabajo Grupal - Tecnologia y Medio Ambiente', sub_s))
story.append(Spacer(1, 6))

# ── 1. INTRODUCCION ──
story.append(H1('1. Introduccion'))
story.append(P(
    'El balance de agua es una herramienta fundamental para la gestion de recursos hidricos en cualquier '
    'establecimiento, ya que permite medir y cuantificar las cantidades de agua que entran y salen de un proceso '
    'productivo. Segun la conferencia sobre Balance de Agua de la asignatura de Tecnologia y Medio Ambiente, '
    'un balance de agua mide las cantidades de dicho recurso que entran en un proceso y la produccion que se genera '
    'como resultado de ese proceso. Este tipo de analisis resulta especialmente relevante en el sector de la '
    'restauracion, donde el agua se utiliza en multiples actividades simultaneas: preparacion de alimentos, limpieza '
    'de instalaciones, consumo directo de clientes y empleados, sanitarios y riego de areas verdes, entre otros usos.'))
story.append(P(
    'El presente trabajo tiene como objetivo elaborar el balance de agua de un restaurante, a partir de los datos '
    'proporcionados sobre su operacion. Se calcula el consumo anual de cada componente identificado, se cuantifica '
    'el volumen no controlado y se analizan sus posibles origenes, y finalmente se proponen acciones concretas para '
    'reducir el consumo de agua. Para el desarrollo de los calculos se siguen los pasos descritos en la conferencia: '
    'enumerar consumidores, analizar el consumo total, realizar el balance, analizar indicadores y generar oportunidades '
    'de ahorro.'))

# ── 2. DATOS DEL RESTAURANTE ──
story.append(H1('2. Datos del Restaurante'))
story.append(P(
    'A continuacion se presentan los datos operativos del restaurante proporcionados para el desarrollo del '
    'balance de agua. Estos datos incluyen tanto los parametros de operacion como los consumos registrados '
    'por cada area del establecimiento, asi como la lectura del medidor principal.'))
story.append(Spacer(1, 12))

dd = [
    [P('<b>Parametro</b>', hc), P('<b>Valor</b>', hc), P('<b>Unidad</b>', hc)],
    [P('Clientes atendidos por dia', cl), P('120', cs), P('clientes/dia', cs)],
    [P('Consumo promedio por cliente', cl), P('25', cs), P('L/cliente', cs)],
    [P('Dias de operacion al ano', cl), P('300', cs), P('dias/ano', cs)],
    [P('Numero de empleados', cl), P('15', cs), P('empleados', cs)],
    [P('Consumo por empleado', cl), P('50', cs), P('L/dia', cs)],
    [P('Consumo en cocina', cl), P('1,200', cs), P('L/dia', cs)],
    [P('Consumo en limpieza general', cl), P('800', cs), P('L/dia', cs)],
    [P('Consumo en sanitarios', cl), P('1,000', cs), P('L/dia', cs)],
    [P('Consumo en riego', cl), P('15', cs), P('m' + u'\u00b3' + '/mes', cs)],
    [P('Volumen no controlado', cl), P('5%', cs), P('del consumo total', cs)],
    [P('<b>Volumen total registrado (medidor)</b>', cl), P('<b>2,205</b>', cs), P('m' + u'\u00b3' + '/ano', cs)],
]
story.append(tbl(dd, [aw*0.50, aw*0.25, aw*0.25]))
story.append(P('<b>Tabla 1.</b> Datos operativos del restaurante para el balance de agua.', cap_s))
story.append(Spacer(1, 12))

# ── 3. CALCULO DEL CONSUMO ANUAL POR COMPONENTE ──
story.append(H1('3. Calculo del Consumo Anual por Componente'))
story.append(P(
    'Siguiendo la metodologia de la conferencia (Paso 1: Identificar todos los consumidores de agua; Paso 3: '
    'Cuantificar todos los volumenes de agua por areas de proceso), se procede a calcular el consumo anual de cada '
    f'componente del restaurante. Los consumos diarios se convierten a valores anuales considerando los 300 dias '
    f'de operacion, y los consumos mensuales se proyectan a 12 meses. Se utiliza la relacion 1 {M3} = 1,000 L '
    f'para expresar todos los resultados en metros cubicos por ano ({M3}/ano), que es la unidad del medidor principal.'))

# 3.1 Clientes
story.append(H2('3.1. Consumo de Clientes'))
story.append(P(
    'Para calcular el consumo anual de agua atribuible a los clientes del restaurante, se multiplica el numero '
    'de clientes atendidos por dia por el consumo promedio por cliente, obteniendo el consumo diario total. '
    'Luego, este valor diario se proyecta al ano multiplicando por los dias de operacion. El razonamiento sigue '
    'el principio del aforo volumetrico presentado en la diapositiva 12 de la conferencia, donde se establece '
    'una relacion proporcional entre el volumen y el tiempo.'))
story.append(Eq('V<sub>clientes</sub> = n<sub>clientes</sub> x C<sub>promedio</sub> x D<sub>operacion</sub>'))
story.append(Eq('V<sub>clientes</sub> = 120 clientes/dia x 25 L/cliente x 300 dias/ano'))
story.append(Eq('V<sub>clientes</sub> = 3,000 L/dia x 300 dias/ano'))
story.append(Eq('V<sub>clientes</sub> = 900,000 L/ano x (1 ' + M3 + ' / 1,000 L)'))
story.append(Eq(f'<b>V<sub>clientes</sub> = 900 {M3}/ano</b>'))
story.append(P(
    f'El consumo de agua por parte de los clientes representa el 40.8% del consumo total registrado, '
    'constituyendose como el mayor consumidor individual del restaurante. Este resultado es consistente con '
    'lo observado en la presentacion para el caso de hoteles, donde el consumo por huesped tambien '
    'representa la proporcion mas significativa del uso total de agua en el establecimiento.'))

# 3.2 Empleados
story.append(H2('3.2. Consumo de Empleados'))
story.append(P(
    'El consumo de agua de los empleados incluye el agua para beber, aseo personal durante la jornada laboral '
    'y otros usos basicos. Se calcula de manera similar al consumo de clientes, multiplicando el numero de '
    'empleados por su consumo diario individual y proyectando al periodo anual de operacion.'))
story.append(Eq('V<sub>empleados</sub> = n<sub>empleados</sub> x C<sub>empleado</sub> x D<sub>operacion</sub>'))
story.append(Eq('V<sub>empleados</sub> = 15 empleados x 50 L/dia x 300 dias/ano'))
story.append(Eq('V<sub>empleados</sub> = 750 L/dia x 300 dias/ano'))
story.append(Eq('V<sub>empleados</sub> = 225,000 L/ano x (1 ' + M3 + ' / 1,000 L)'))
story.append(Eq(f'<b>V<sub>empleados</sub> = 225 {M3}/ano</b>'))
story.append(P(
    'Aunque el consumo individual por empleado (50 L/dia) es el doble del consumo por cliente (25 L/cliente), '
    'el numero reducido de empleados (15) frente a la afluencia de clientes (120 por dia) hace que este '
    'componente represente solo el 10.2% del consumo total, lo cual es razonable para un restaurante '
    'con esta proporcion de personal frente a la clientela atendida.'))

# 3.3 Cocina
story.append(H2('3.3. Consumo en Cocina'))
story.append(P(
    'El consumo en cocina abarca el lavado de alimentos, utensilios, ollas y sartenes, asi como el agua utilizada '
    'en la preparacion de alimentos y bebidas. Este componente abarca todas las actividades que se realizan '
    'en el area de cocina del restaurante, como se identifico en el Paso 1 de la metodologia.'))
story.append(Eq('V<sub>cocina</sub> = C<sub>cocina,dia</sub> x D<sub>operacion</sub>'))
story.append(Eq('V<sub>cocina</sub> = 1,200 L/dia x 300 dias/ano'))
story.append(Eq('V<sub>cocina</sub> = 360,000 L/ano x (1 ' + M3 + ' / 1,000 L)'))
story.append(Eq(f'<b>V<sub>cocina</sub> = 360 {M3}/ano</b>'))
story.append(P(
    f'Con 360 {M3}/ano, la cocina representa el 16.3% del consumo total. Este valor es coherente con los '
    'datos presentados en la conferencia para industrias de alimentos, donde las operaciones de lavado y '
    'preparacion suelen demandar volumenes significativos de agua, siendo una de las areas con mayor potencial '
    'de optimizacion a traves de equipos eficientes y procedimientos de trabajo mejorados.'))

# 3.4 Limpieza
story.append(H2('3.4. Consumo en Limpieza General'))
story.append(P(
    'El consumo en limpieza general incluye el agua utilizada para el lavado de pisos, paredes, superficies de '
    'mesas y cualquier otra area del restaurante. Segun la conferencia, la colocacion de pistolas de bajo '
    'volumen y alta presion en las mangueras puede reducir significativamente este consumo, ya que permite '
    'que el agua no fluya cuando no se la esta usando y reduce los tiempos de lavado.'))
story.append(Eq('V<sub>limpieza</sub> = C<sub>limpieza,dia</sub> x D<sub>operacion</sub>'))
story.append(Eq('V<sub>limpieza</sub> = 800 L/dia x 300 dias/ano'))
story.append(Eq('V<sub>limpieza</sub> = 240,000 L/ano x (1 ' + M3 + ' / 1,000 L)'))
story.append(Eq(f'<b>V<sub>limpieza</sub> = 240 {M3}/ano</b>'))
story.append(P(
    f'Este componente representa el 10.9% del consumo total. La diapositiva 28 de la conferencia senala que '
    'el uso de mangueras sin pistolas de cierre rapido y la practica de usar las mangueras como escobas '
    'generan un desperdicio considerable. La implementacion de pistolas de alta presion y el uso de cepillos '
    'de goma para limpiar el piso, reservando las mangueras solo para el enjuague final, son buenas practicas '
    'que podrian reducir este consumo de manera significativa.'))

# 3.5 Sanitarios
story.append(H2('3.5. Consumo en Sanitarios'))
story.append(P(
    'El consumo en sanitarios contempla el agua utilizada tanto por clientes como por empleados en los '
    'servicios higienicos del restaurante. Este componente incluye inodoros, lavamanos y urinarios, y suele '
    'ser uno de los consumidores mas significativos en establecimientos de atencion al publico.'))
story.append(Eq('V<sub>sanitarios</sub> = C<sub>sanitarios,dia</sub> x D<sub>operacion</sub>'))
story.append(Eq('V<sub>sanitarios</sub> = 1,000 L/dia x 300 dias/ano'))
story.append(Eq('V<sub>sanitarios</sub> = 300,000 L/ano x (1 ' + M3 + ' / 1,000 L)'))
story.append(Eq(f'<b>V<sub>sanitarios</sub> = 300 {M3}/ano</b>'))
story.append(P(
    f'Los sanitarios representan el 13.6% del consumo total. Este valor podria reducirse mediante la instalacion '
    'de dispositivos de bajo consumo en inodoros y grifos sensoriales en lavamanos. Las fugas en los sistemas '
    f'sanitarios tambien contribuyen a este consumo, tal como se senala en la diapositiva 27, donde se indica '
    f'que una gota por un orificio de 2 mm en una tuberia puede representar mas de 100 {M3} de agua al ano.'))

# 3.6 Riego
story.append(H2('3.6. Consumo en Riego'))
story.append(P(
    'El consumo en riego corresponde al agua utilizada para el mantenimiento de areas verdes del restaurante, '
    'jardines y zonas de estetica exterior. A diferencia de los demas componentes que se expresan en consumo '
    'diario, este dato se proporciona en metros cubicos por mes, por lo que la conversion anual requiere '
    'multiplicar por 12 meses.'))
story.append(Eq('V<sub>riego</sub> = C<sub>riego,mes</sub> x 12 meses/ano'))
story.append(Eq(f'V<sub>riego</sub> = 15 {M3}/mes x 12 meses/ano'))
story.append(Eq(f'<b>V<sub>riego</sub> = 180 {M3}/ano</b>'))
story.append(P(
    f'El riego representa el 8.2% del consumo total. Aunque es el componente de menor volumen, su optimizacion '
    'es relevante desde el punto de vista ambiental, ya que el riego puede sustituirse parcialmente con agua '
    'de lluvia recolectada, como se menciono en la diapositiva 4 de la conferencia entre las fuentes de '
    'abastecimiento de agua. El uso de sistemas de riego por goteo tambien permitiria reducir este consumo.'))

# ── 4. BALANCE RESUMEN ──
story.append(H1('4. Balance de Agua: Tabla Resumen'))
story.append(P(
    f'La Tabla 2 presenta el resumen consolidado del balance de agua del restaurante. Se muestran los datos de '
    'entrada para cada componente, el calculo del consumo anual en litros y su equivalente en metros cubicos, '
    f'asi como el porcentaje que representa cada uno respecto al consumo total registrado por el medidor. '
    f'Como se observa, la suma de todos los componentes identificados es exactamente 2,205 {M3}/ano, '
    'lo cual coincide con la lectura del medidor principal del restaurante, validando la consistencia del balance.'))
story.append(Spacer(1, 12))

cd = [
    [P('<b>Componente</b>', hc), P('<b>Dato Base</b>', hc),
     P(f'<b>V<sub>diario</sub></b>', hc), P(f'<b>V<sub>anual</sub> ({M3}/ano)</b>', hc), P('<b>%</b>', hc)],
    [P('Clientes', cl), P('120 x 25 L/cliente', cs), P('3,000 L', cs), P('900', cs), P('40.8%', cs)],
    [P('Empleados', cl), P('15 x 50 L/dia', cs), P('750 L', cs), P('225', cs), P('10.2%', cs)],
    [P('Cocina', cl), P('1,200 L/dia', cs), P('1,200 L', cs), P('360', cs), P('16.3%', cs)],
    [P('Limpieza', cl), P('800 L/dia', cs), P('800 L', cs), P('240', cs), P('10.9%', cs)],
    [P('Sanitarios', cl), P('1,000 L/dia', cs), P('1,000 L', cs), P('300', cs), P('13.6%', cs)],
    [P('Riego', cl), P(f'15 m\u00b3/mes', cs), P('--', cs), P('180', cs), P('8.2%', cs)],
    [P('<b>TOTAL</b>', cl), P('', cs), P('', cs), P('<b>2,205</b>', cs), P('<b>100%</b>', cs)],
]
story.append(tbl(cd, [aw*0.20, aw*0.24, aw*0.16, aw*0.24, aw*0.16]))
story.append(P('<b>Tabla 2.</b> Balance de agua del restaurante - resumen anual por componente.', cap_s))
story.append(Spacer(1, 12))

# ── 5. GRAFICO ──
story.append(H1('5. Distribucion del Consumo de Agua'))
story.append(P(
    'La Figura 1 presenta un diagrama de pastel (donut chart) con la distribucion porcentual del consumo de agua '
    'por cada componente del restaurante. Como se establece en la diapositiva 11 de la conferencia, los resultados '
    'del balance pueden presentarse en forma de diagrama de pastel para facilitar la visualizacion de las proporciones. '
    'Se observa que el consumo de clientes domina con un 40.8%, seguido por la cocina (16.3%), los sanitarios (13.6%), '
    'la limpieza (10.9%), los empleados (10.2%) y el riego (8.2%). Esta representacion grafica permite identificar '
    'rapidamente los componentes con mayor potencial de ahorro.'))
story.append(Spacer(1, 12))
img = Image(CHART_PATH, width=aw*0.85, height=aw*0.60)
img.hAlign = 'CENTER'
story.append(img)
story.append(P('<b>Figura 1.</b> Distribucion porcentual del consumo de agua anual por componente.', cap_s))
story.append(Spacer(1, 12))

# ── 6. VOLUMEN NO CONTROLADO ──
story.append(H1('6. Volumen No Controlado'))
story.append(P(
    'El volumen no controlado representa la diferencia entre el agua que efectivamente ingresa al sistema y el agua '
    'que se registra a traves de los medidores individuales por componente. En este caso, los datos del problema '
    'establecen que el volumen no controlado equivale al 5% del consumo total registrado. Siguiendo el razonamiento '
    'presentado en la diapositiva 11 de la conferencia, donde se indica que las perdidas de agua (fugas) deben ser '
    'consideradas como parte del balance, se procede a su cuantificacion.'))

story.append(H2('6.1. Cuantificacion'))
story.append(Eq('V<sub>no controlado</sub> = 5% x V<sub>total registrado</sub>'))
story.append(Eq(f'V<sub>no controlado</sub> = 0.05 x 2,205 {M3}/ano'))
story.append(Eq(f'<b>V<sub>no controlado</sub> = 110.25 {M3}/ano</b>'))
story.append(P(
    f'Este volumen de 110.25 {M3}/ano equivale a 110,250 litros de agua al ano que se pierden sin ser '
    'atribuidos a ningun componente especifico del consumo. Dado que la suma de los componentes identificados '
    f'coincide exactamente con la lectura del medidor (2,205 {M3}/ano), se concluye que el volumen no '
    'controlado se encuentra distribuido dentro de las mediciones de cada componente, es decir, esta embebido '
    f'en los valores registrados. En un sistema ideal con medicion individual perfecta, el consumo efectivo util '
    f'seria de aproximadamente 2,094.75 {M3}/ano, y los 110.25 {M3}/ano restantes '
    'corresponderian a perdidas reales.'))

story.append(H2('6.2. Analisis del Origen del Volumen No Controlado'))
story.append(P(
    'El origen del volumen no controlado puede atribuirse a multiples fuentes dentro del sistema de distribucion '
    'de agua del restaurante. Segun lo presentado en las diapositivas 11 y 27 de la conferencia, las fugas en tuberias, '
    'valvulas y grifos constituyen una de las principales causas de perdida de agua. La conferencia senala que una '
    f'simple gota por un orificio de 2 mm en una tuberia puede representar mas de 100 {M3} de agua al ano, '
    f'lo cual es muy cercano al volumen no controlado calculado (110.25 {M3}/ano), sugiriendo que '
    'incluso unas pocas fugas pequenas podrian explicar la totalidad del volumen no controlado del restaurante.'))
story.append(P(
    'Adicionalmente, los sanitarios representan un foco importante de perdidas no controladas, ya que las fugas '
    'en inodoros (por ejemplo, una valvula de descarga defectuosa) pueden pasar inadvertidas durante meses, '
    'consumiendo entre 200 y 400 litros por dia sin generar un impacto visible en la operacion. Tambien contribuyen '
    'las perdidas en las tuberias subterraneas o empotradas que no son visibles, las conexiones defectuosas entre '
    'tuberias y accesorios, y el uso ineficiente del agua en limpieza donde las mangueras permanecen abiertas '
    'durante periodos prolongados sin supervision directa. El mal estado de valvulas y grifos, tal como se '
    'describe en la diapositiva 27, genera un incremento significativo en el consumo que se registra dentro de '
    'cada componente pero que no corresponde a un uso productivo del recurso.'))

story.append(Spacer(1, 12))
od = [
    [P('<b>Posible Origen</b>', hc), P('<b>Descripcion</b>', hc), P('<b>Impacto</b>', hc)],
    [P('Fugas en tuberias', cl), P('Perdidas por grietas o joints defectuosos en la red interna', cl), P('Alto', cs)],
    [P('Fugas en sanitarios', cl), P('Inodoros y grifos con fugas no visibles', cl), P('Alto', cs)],
    [P('Grifos y valvulas', cl), P('Mantenimiento deficiente de grifos y valvulas de cierre', cl), P('Medio', cs)],
    [P('Mangueras sin control', cl), P('Uso de mangueras sin pistolas de cierre rapido', cl), P('Medio', cs)],
    [P('Conexiones defectuosas', cl), P('Filtros, accesorios o uniones con microfugas', cl), P('Bajo', cs)],
]
story.append(tbl(od, [aw*0.22, aw*0.58, aw*0.20]))
story.append(P('<b>Tabla 3.</b> Posibles origenes del volumen no controlado y su impacto estimado.', cap_s))
story.append(Spacer(1, 12))

# ── 7. PROPUESTAS ──
story.append(H1('7. Propuestas de Reduccion del Consumo de Agua'))
story.append(P(
    'Con base en los resultados del balance de agua y en las buenas practicas ambientales presentadas en las '
    'diapositivas 25 a 28 de la conferencia, se proponen a continuacion tres acciones concretas para reducir el '
    'consumo de agua en el restaurante. Cada propuesta se evalua segun los criterios de viabilidad tecnica, '
    'economica y ambiental establecidos en las diapositivas 21 a 23 de la conferencia.'))

story.append(H2('7.1. Instalacion de Medidores Individuales por Area'))
story.append(P(
    'Se propone instalar medidores de agua en las areas de mayor consumo: cocina, sanitarios y limpieza. Esta '
    'medida permite realizar un monitoreo continuo del consumo por area, como se describe en la diapositiva 25 de '
    'la conferencia. Los datos recolectados de los medidores serviran para calcular indicadores de uso de agua por '
    'departamento, establecer metas de consumo y detectar anomalias o fugas de forma temprana. La diapositiva 26 '
    'proporciona un formato de hoja de control de uso de agua que podria implementarse para registrar las lecturas '
    'del contador y la produccion diaria, permitiendo calcular el indicador litros de agua por tonelada producida '
    'o atendida. Esta accion es viable tecnicamente sin cambios sustanciales en la infraestructura, ya que solo '
    'requiere la instalacion de medidores en las tuberias existentes. Economicamente, el periodo de repago es '
    'corto considerando el ahorro derivado de la deteccion temprana de fugas. Ambientalmente, reduce el consumo al '
    'hacer visible el uso del agua y motivar la eficiencia.'))

story.append(H2('7.2. Programa de Mantenimiento Preventivo de Tuberias y Grifos'))
story.append(P(
    'Se recomienda implementar un programa de mantenimiento preventivo que incluya la revision periodica de '
    'tuberias, valvulas, grifos, bombas y conexiones, tal como se establece en la diapositiva 27 de la conferencia. '
    'Este programa debe incluir inspecciones visuales mensuales, pruebas de deteccion de fugas trimestrales y el '
    'reemplazo inmediato de componentes defectuosos. La conferencia indica que el mal estado de las tuberias, '
    'grifos y valvulas genera un incremento en el consumo de agua y, por ende, en los costos. Una gota por un '
    f'orificio de 2 mm puede representar mas de 100 {M3}/ano, lo cual esta muy cerca del volumen no '
    f'controlado calculado de 110.25 {M3}/ano. Esta accion tiene alta viabilidad tecnica y '
    'economica, ya que el costo de reparacion de fugas es generalmente bajo comparado con el costo del agua perdida, '
    'y ambientalmente minimiza el volumen de aguas residuales y el consumo total.'))

story.append(H2('7.3. Sustitucion de Mangueras por Pistolas de Alta Presion y Cepillos'))
story.append(P(
    'Se propone la sustitucion de las mangueras convencionales por pistolas de bajo volumen y alta presion en todas '
    'las areas de limpieza del restaurante, como se describe en la diapositiva 28 de la conferencia. Esta medida '
    'ofrece multiples beneficios: evita que las llaves permanezcan abiertas por olvido del operario, permite que '
    'el agua no fluya cuando no se la esta usando, reduce los tiempos de operacion de lavado y asegura que el '
    'chorro de agua salga mas fuerte, requiriendo menos volumen para lograr la misma limpieza. Adicionalmente, '
    'se recomienda usar pistolas metalicas en lugar de plasticas por motivos de higiene y durabilidad, y '
    'utilizar cepillos de goma para limpiar el piso, reservando las mangueras unicamente para el enjuague final. '
    'Esta accion es tecnicamente viable sin cambios en la infraestructura, economicamente atractiva con un periodo '
    'de repago corto, y ambientalmente efectiva al reducir tanto el consumo de agua como el gasto en '
    'materiales de limpieza.'))

story.append(Spacer(1, 12))
pd = [
    [P('<b>Propuesta</b>', hc), P('<b>Viab. Tecnica</b>', hc),
     P('<b>Viab. Economica</b>', hc), P('<b>Viab. Ambiental</b>', hc)],
    [P('Medidores individuales', cl), P('Si', cs), P('Si', cs), P('Si', cs)],
    [P('Mantenimiento preventivo', cl), P('Si', cs), P('Si', cs), P('Si', cs)],
    [P('Pistolas de alta presion', cl), P('Si', cs), P('Si', cs), P('Si', cs)],
]
story.append(tbl(pd, [aw*0.34, aw*0.22, aw*0.22, aw*0.22]))
story.append(P('<b>Tabla 4.</b> Evaluacion de viabilidad de las propuestas de reduccion de consumo.', cap_s))
story.append(Spacer(1, 12))

# ── 8. CONCLUSIONES ──
story.append(H1('8. Conclusiones'))
story.append(P(
    f'El balance de agua del restaurante arroja un consumo total anual de 2,205 {M3}/ano, distribuido '
    f'en seis componentes principales. El mayor consumidor es el area de clientes con 900 {M3}/ano (40.8%), '
    f'seguido por la cocina con 360 {M3}/ano (16.3%), los sanitarios con 300 {M3}/ano (13.6%), '
    f'la limpieza con 240 {M3}/ano (10.9%), los empleados con 225 {M3}/ano (10.2%) y el riego con '
    f'180 {M3}/ano (8.2%). La concordancia entre la suma de los componentes identificados y la lectura del '
    'medidor principal valida la consistencia del balance realizado.'))
story.append(P(
    f'El volumen no controlado se cuantifico en 110.25 {M3}/ano (5% del total), el cual se encuentra '
    'distribuido dentro de las mediciones de cada componente. Su origen probable se asocia principalmente a fugas en '
    'tuberias y sanitarios, asi como al mal estado de grifos y valvulas. Las tres propuestas formuladas -- '
    'instalacion de medidores individuales, programa de mantenimiento preventivo y sustitucion de mangueras por '
    'pistolas de alta presion -- son viables tanto tecnica como economica y ambientalmente, y su implementacion '
    'contribuiria a reducir significativamente el consumo de agua y el volumen no controlado del restaurante, '
    'alineandose con los principios de uso eficiente del recurso hidrico promovidos en la conferencia.'))

# ── 9. REFERENCIAS (APA 7) ──
story.append(H1('Referencias'))
story.append(P(
    'Direccion de Area de Conocimiento Industrial y Produccion. (s.f.). <i>Conferencia: Balance de Agua</i>. '
    'Asignatura: Tecnologia y Medio Ambiente. [Presentacion en PowerPoint].', ref_s))

# ── BUILD ──
doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)
print(f'PDF saved: {PDF_PATH}')
