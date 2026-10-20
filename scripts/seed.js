/**
 * Carga datos de EJEMPLO para desarrollo / demostración.
 *
 *   npm run seed          → inserta sólo en colecciones vacías (seguro).
 *   npm run seed:reset    → BORRA noticias, carreras, calendario, trámites y carrusel y vuelve a cargarlos.
 *
 * ⚠ Las carreras, fechas y requisitos son ilustrativos: reemplazalos por los
 *   datos oficiales del IES N° 11 desde el panel de administración (/admin).
 */
require('dotenv').config();
const mongoose = require('mongoose');

const News = require('../models/News');
const Career = require('../models/Career');
const CalendarEvent = require('../models/CalendarEvent');
const Procedure = require('../models/Procedure');
const Slide = require('../models/Slide');
const { bootstrap } = require('../utils/bootstrap');

const RESET = process.argv.includes('--reset');

/** Fecha (medianoche UTC) a N días de hoy. */
const inDays = (n) => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

const careers = [
  {
    name: 'Profesorado de Educación Primaria',
    degree: 'Profesor/a de Educación Primaria',
    area: 'Formación Docente',
    durationYears: 4,
    modality: 'Presencial',
    shifts: ['Mañana', 'Tarde'],
    description: 'Formación de docentes para el nivel primario con prácticas profesionales en escuelas asociadas desde el primer año.',
    order: 1,
  },
  {
    name: 'Profesorado de Educación Inicial',
    degree: 'Profesor/a de Educación Inicial',
    area: 'Formación Docente',
    durationYears: 4,
    modality: 'Presencial',
    shifts: ['Mañana'],
    description: 'Prepara docentes para el trabajo pedagógico con niñas y niños de 45 días a 5 años en jardines maternales y de infantes.',
    order: 2,
  },
  {
    name: 'Profesorado de Educación Secundaria en Matemática',
    degree: 'Profesor/a de Educación Secundaria en Matemática',
    area: 'Formación Docente',
    durationYears: 4,
    modality: 'Presencial',
    shifts: ['Tarde', 'Noche'],
    description: 'Formación disciplinar y didáctica para la enseñanza de la Matemática en el nivel secundario.',
    order: 3,
  },
  {
    name: 'Tecnicatura Superior en Desarrollo de Software',
    degree: 'Técnico/a Superior en Desarrollo de Software',
    area: 'Tecnología',
    durationYears: 3,
    modality: 'Semipresencial',
    shifts: ['Noche'],
    description: 'Programación, bases de datos, desarrollo web y metodologías ágiles orientadas a la inserción laboral en la industria del software.',
    order: 4,
  },
];

const procedures = [
  {
    title: 'Boleto Estudiantil Gratuito (BEGU)',
    icon: 'bus',
    status: 'abierto',
    description: 'Solicitá o renová el beneficio del boleto gratuito para viajar al Instituto durante el ciclo lectivo.',
    requirements: ['DNI (original y copia)', 'Constancia de alumno regular vigente', 'Comprobante de domicilio'],
    schedule: 'Gestión en Bedelía, todos los turnos',
    order: 1,
  },
  {
    title: 'Becas Progresar',
    icon: 'scholarship',
    status: 'abierto',
    description: 'Acompañamiento para la certificación de alumno regular y rendimiento académico requeridos por el programa.',
    requirements: ['Inscripción previa en la web oficial del programa', 'DNI', 'Constancia de alumno regular'],
    schedule: 'Certificaciones de lunes a viernes',
    order: 2,
  },
  {
    title: 'Constancia de Alumno Regular',
    icon: 'document',
    status: 'abierto',
    description: 'Pedí tu constancia para presentar en trabajo, obra social, ANSES u otros organismos.',
    requirements: ['DNI', 'Estar inscripto/a en al menos una unidad curricular del ciclo vigente'],
    schedule: 'Entrega en 48 h hábiles',
    order: 3,
  },
  {
    title: 'Bono Contribución (Cooperadora)',
    icon: 'wallet',
    status: 'abierto',
    description: 'Aporte voluntario a la Asociación Cooperadora que sostiene mejoras edilicias y recursos para estudiantes.',
    requirements: ['DNI', 'Abonar en Cooperadora y conservar el comprobante'],
    schedule: 'Cooperadora, horario de atención por turno',
    order: 4,
  },
  {
    title: 'Retiro de Títulos y Certificados',
    icon: 'diploma',
    status: 'cerrado',
    description: 'Retiro de títulos legalizados y certificados analíticos. Se habilita por cronograma publicado en Novedades.',
    requirements: ['DNI original', 'Libre deuda de biblioteca', 'Turno asignado por Bedelía'],
    schedule: 'Próxima apertura según cronograma',
    order: 5,
  },
];

const events = [
  { title: 'Inscripción a Mesas Extraordinarias', category: 'mesa-extraordinaria', date: inDays(2), endDate: inDays(6), shift: 'Todo el día', status: 'abierto', location: 'Bedelía / Sistema de autogestión' },
  { title: 'Mesas Extraordinarias — 1° llamado', category: 'mesa-extraordinaria', date: inDays(14), endDate: inDays(18), shift: 'Mañana', status: 'programado', career: 'Todas las carreras' },
  { title: 'Mesas Extraordinarias — Turno Noche', category: 'mesa-extraordinaria', date: inDays(15), shift: 'Noche', status: 'programado', career: 'Tecnicatura Superior en Desarrollo de Software' },
  { title: 'Inscripción a Mesas Ordinarias (Diciembre)', category: 'mesa-ordinaria', date: inDays(25), endDate: inDays(30), shift: 'Todo el día', status: 'programado' },
  { title: 'Mesas Ordinarias — 1° llamado', category: 'mesa-ordinaria', date: inDays(35), endDate: inDays(42), shift: 'Mañana', status: 'programado', career: 'Profesorados' },
  { title: 'Mesas Ordinarias — 1° llamado', category: 'mesa-ordinaria', date: inDays(35), endDate: inDays(42), shift: 'Noche', status: 'programado', career: 'Tecnicaturas' },
  { title: 'Mesas Ordinarias — 2° llamado', category: 'mesa-ordinaria', date: inDays(49), endDate: inDays(53), shift: 'Tarde', status: 'programado' },
  { title: 'Feriado nacional — Sin actividad', category: 'feriado', date: inDays(10), shift: 'Todo el día', status: 'programado' },
  { title: 'Jornada institucional — Suspensión de clases', category: 'feriado', date: inDays(21), shift: 'Todo el día', status: 'programado', description: 'Jornada de trabajo docente. No hay atención en Bedelía.' },
  { title: 'Preinscripción online a carreras', category: 'cursillo', date: inDays(30), endDate: inDays(75), shift: 'Todo el día', status: 'programado' },
  { title: 'Cursillo de ingreso — Profesorados', category: 'cursillo', date: inDays(95), endDate: inDays(110), shift: 'Mañana', status: 'programado', career: 'Profesorados' },
  { title: 'Cursillo de ingreso — Tecnicaturas', category: 'cursillo', date: inDays(95), endDate: inDays(110), shift: 'Noche', status: 'programado', career: 'Tecnicaturas' },
];

const news = [
  {
    title: 'Abrió la inscripción a Mesas Extraordinarias',
    summary: 'Los estudiantes pueden inscribirse en Bedelía o por el sistema de autogestión. Revisá fechas y requisitos en el calendario.',
    content: 'La inscripción a Mesas Extraordinarias se encuentra abierta. Recordá verificar tu condición de regularidad antes de inscribirte y consultar el calendario académico para conocer los días y turnos de cada llamado.',
    category: 'Académico',
    date: inDays(-1),
    featured: true,
  },
  {
    title: 'Jornada de Educación Sexual Integral',
    summary: 'Encuentro abierto a toda la comunidad educativa con talleres por carrera y una charla central en el SUM.',
    content: 'La jornada incluirá talleres simultáneos organizados por cada carrera y un panel de cierre. La asistencia es obligatoria para estudiantes de los profesorados.',
    category: 'Eventos/Jornadas',
    date: inDays(-4),
  },
  {
    title: 'Renovación del Boleto Estudiantil Gratuito',
    summary: 'Se recuerda a los estudiantes que deben presentar la constancia de alumno regular actualizada para renovar el BEGU.',
    category: 'Institucional',
    date: inDays(-7),
  },
  {
    title: 'Convocatoria a ayudantes alumnos',
    summary: 'Se abre la convocatoria para estudiantes avanzados interesados en colaborar en espacios curriculares de primer año.',
    category: 'Académico',
    date: inDays(-12),
  },
  {
    title: 'Semana de la Tecnología en el IES N° 11',
    summary: 'Charlas, muestras de proyectos estudiantiles y un hackatón para estudiantes de la Tecnicatura en Desarrollo de Software.',
    category: 'Eventos/Jornadas',
    date: inDays(-18),
  },
];

const slides = [
  {
    eyebrow: 'Ciclo lectivo 2027',
    title: 'Empezá tu camino',
    highlight: 'en el IES N° 11',
    subtitle: 'Preinscribite online a nuestros profesorados y tecnicaturas.',
    ctaText: 'Conocé la propuesta',
    ctaUrl: '#carreras',
    order: 1,
  },
  {
    eyebrow: 'Turno de exámenes',
    title: 'Mesas Extraordinarias',
    highlight: 'inscripción abierta',
    subtitle: 'Revisá fechas, turnos y requisitos antes de inscribirte.',
    ctaText: 'Ver fechas',
    ctaUrl: '#calendario',
    order: 2,
  },
  {
    eyebrow: 'Hub estudiantil',
    title: 'Tus trámites',
    highlight: 'en un solo lugar',
    subtitle: 'BEGU, Progresar, constancias y más, con requisitos descargables.',
    ctaText: 'Ver trámites',
    ctaUrl: '#tramites',
    order: 3,
  },
];

async function seedCollection(Model, docs, label) {
  if (RESET) await Model.deleteMany({});
  const existing = await Model.estimatedDocumentCount();
  if (existing > 0) {
    console.info(`  · ${label}: ya tiene ${existing} documentos, se omite (usá --reset para recargar).`);
    return;
  }
  await Model.insertMany(docs);
  console.info(`  ✓ ${label}: ${docs.length} documentos cargados.`);
}

async function run() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ies11';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.info(`[seed] Conectado a ${mongoose.connection.name}${RESET ? ' (modo --reset)' : ''}`);

  await bootstrap();
  await seedCollection(Career, careers, 'Carreras');
  await seedCollection(Procedure, procedures, 'Trámites');
  await seedCollection(CalendarEvent, events, 'Calendario');
  await seedCollection(News, news, 'Noticias');
  await seedCollection(Slide, slides, 'Carrusel');

  console.info('[seed] Listo.');
}

run()
  .catch((err) => {
    console.error('[seed] Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
