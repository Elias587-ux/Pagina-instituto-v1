/**
 * Loads the REAL IES N° 11 content (2026/2027 cycle) taken from the official
 * brochures (Google Drive "propuestas" folder) and the institutional flyers.
 *
 *   npm run import:real            → upserts the data into the database.
 *   npm run import:real -- --dry-run → only validates the data (no DB connection).
 *
 * Safe to run more than once: every record is matched by a natural key
 * (career name, procedure title, exam board session + career + subject) and
 * updated in place. Nothing is deleted. Careers that are not part of the
 * official offer (e.g. the old example "profesorados") are only hidden
 * (active: false), never removed.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const Career = require('../models/Career');
const Procedure = require('../models/Procedure');
const ExamBoard = require('../models/ExamBoard');
const Setting = require('../models/Setting');

const DRY_RUN = process.argv.includes('--dry-run');

const drive = (id) => `https://drive.google.com/file/d/${id}/view`;

const AREAS = {
  health: 'Salud y Atención a las Personas',
  tech: 'Informática y Tecnología',
  energy: 'Energía, Ambiente y Seguridad',
  food: 'Gastronomía y Cultura Alimentaria',
  design: 'Diseño e Indumentaria',
  tourism: 'Turismo y Servicios',
};

// ─── Careers (13 tecnicaturas, "Oferta educativa 2027") ──────────────────
const careerBase = { durationYears: 3, modality: 'Presencial', active: true };

const careers = [
  {
    name: 'Acompañamiento Terapéutico',
    degree: 'Técnico/a Superior en Acompañamiento Terapéutico',
    area: AREAS.health,
    studyPlanUrl: drive('1YC4P2-4UNNOx41wSyyonVEyuq7ELF-GX'),
    coordinator: 'Mamani Gladys',
    coordinatorSchedule: 'Miércoles 16:10 a 18:20 hs.',
    description:
      'La Tecnicatura Superior en Acompañamiento Terapéutico forma profesionales capacitados para integrar equipos interdisciplinarios de salud, educación y desarrollo social, brindando acompañamiento a personas que atraviesan situaciones de vulnerabilidad, discapacidad o padecimiento subjetivo.\n\nEl Acompañante Terapéutico (AT) interviene en contextos clínicos, institucionales y comunitarios, promoviendo la autonomía, la inclusión social y la mejora de la calidad de vida de los sujetos a los que acompaña. Su formación combina fundamentos teóricos de la psicología, la salud mental y las ciencias sociales, con prácticas profesionalizantes que fortalecen su posicionamiento ético y vincular.\n\nLa carrera busca desarrollar en los estudiantes una mirada integral del sujeto y su entorno, fomentando la reflexión crítica, el trabajo en red y el compromiso con los derechos humanos.',
  },
  {
    name: 'Administración de Servicios de Salud',
    degree: 'Técnico/a Superior en Administración de Servicios de Salud',
    area: AREAS.health,
    studyPlanUrl: drive('1FEwcm7WPyTYCuOTuQNLvIHESyDiOpdb6'),
    coordinator: 'Mendoza Martín',
    coordinatorSchedule: 'Viernes 16 a 18 hs.',
    description:
      'El Técnico en Administración de Servicios de Salud es un recurso estratégico clave para la optimización del sector sanitario. Este profesional tiene un rol de apoyo técnico en la gestión, planificación y dirección de los recursos (financieros, humanos y tecnológicos) en hospitales, clínicas y entidades de salud. Su función principal es contribuir a garantizar la eficiencia.\n\nEl futuro técnico adquirirá una visión que le permitirá integrar los equipos tomadores de decisiones en áreas administrativas y no asistenciales como la auditoría, la logística y las finanzas, convirtiéndose en el apoyo operativo que moderniza y hace viable la prestación de servicios de salud.',
  },
  {
    name: 'Agente Sanitario y Promotor de la Salud',
    degree: 'Técnico/a Superior Agente Sanitario y Promotor de la Salud',
    area: AREAS.health,
    studyPlanUrl: drive('1Wqsi0Cy3dcat2F-QS23sBa27__-zJwJY'),
    coordinator: 'López Héctor',
    coordinatorSchedule: 'Viernes 12 a 13 hs. y 21 a 22 hs.',
    description:
      'El Técnico Agente Sanitario y Promotor de la Salud es el profesional que con su formación adquiere un profundo compromiso con la comunidad, transformándose en un trabajador de salud que orienta, promociona y realiza las acciones de Atención Primaria de la Salud, de forma programada y sistematizada. Realiza visitas domiciliarias programadas articulando el contacto directo entre la población y los servicios de salud.\n\nLas incumbencias del título le permiten realizar algunas acciones de enfermería, educación para la salud, intervención social y comunitaria y rehabilitación básica, en instituciones de salud públicas y privadas de distintos niveles de complejidad o en organizaciones de base y ONGs.',
  },
  {
    name: 'Cocinas Regionales y Cultura Alimentaria',
    degree: 'Técnico/a Superior en Cocinas Regionales y Cultura Alimentaria',
    area: AREAS.food,
    studyPlanUrl: drive('1I0uZ849PmVBOSq27wZoBNet7RQx68UTP'),
    coordinator: 'Aguirre Héctor Luis',
    coordinatorSchedule: 'Jueves 09:30 a 11:30 hs.',
    description:
      'Esta oferta educativa se fundamenta en la necesidad de rescatar, revalorizar y preservar la rica y dinámica cultura culinaria de la provincia, destacando las tradiciones locales de regiones emblemáticas como los Valles, la Quebrada, las Yungas y la Puna, junto con sus valiosos patrimonios culturales.\n\nComo egresado podrás desempeñarte en restaurantes, hoteles, centros turísticos, clubes públicos y privados, así como en servicios de banquetes y eventos especiales. También estarás capacitado para emprender proyectos gastronómicos propios y brindar asesoramiento en circuitos alimentarios locales e iniciativas culturales.',
  },
  {
    name: 'Desarrollo de Software',
    degree: 'Técnico/a Superior en Desarrollo de Software',
    area: AREAS.tech,
    studyPlanUrl: drive('1UNrkIx8J4yIi7xqq2yTF5A3bAaCnBbuA'),
    coordinator: 'Gimenez Nora Evangelina',
    coordinatorSchedule: 'Lunes 11:20 a 12:10 hs. · Viernes 11:20 a 12:50 hs.',
    description:
      'La Tecnicatura Superior en Desarrollo de Software es una propuesta formativa orientada a quienes desean integrarse al mundo de la tecnología y la innovación. A lo largo de la carrera, los estudiantes aprenden a analizar necesidades, diseñar soluciones informáticas y desarrollar aplicaciones que aporten valor en distintos ámbitos productivos y sociales.\n\nLa formación combina conocimientos técnicos —como programación, bases de datos y diseño de sistemas— con habilidades blandas, esenciales para el trabajo en equipo y la comunicación profesional. Además, se promueve una actitud ética y creativa, fomentando la actualización constante frente a los cambios tecnológicos.',
  },
  {
    name: 'Diseño de Indumentaria',
    degree: 'Técnico/a Superior en Diseño de Indumentaria',
    area: AREAS.design,
    studyPlanUrl: drive('1H8IeAPvXOes1BS7i5L_9RbwdoljCkciz'),
    coordinator: 'Territoriale Constanza',
    coordinatorSchedule: 'Martes 16:10 a 18:20 hs. · Miércoles 09 a 10 hs.',
    description:
      'La Tecnicatura Superior en Diseño de Indumentaria forma profesionales capaces de crear, desarrollar y producir proyectos de moda con identidad regional y proyección nacional e internacional. Desde la provincia de Jujuy, esta carrera impulsa el diseño como herramienta de expresión cultural, innovación estética y desarrollo socioproductivo.\n\nA lo largo de tres años, la formación integra materias teóricas, técnicas y proyectuales. Las Prácticas Profesionalizantes permiten vincularse con el ámbito productivo real, promoviendo el trabajo colaborativo con emprendimientos locales, talleres y proyectos de diseño sustentable. ¡Estudiá diseño en Jujuy y proyectá tu futuro!',
  },
  {
    name: 'Enfermería',
    degree: 'Técnico/a Superior en Enfermería',
    area: AREAS.health,
    studyPlanUrl: drive('1g8Pc5W_FljxWvJl-k_X4h00bnjkVpORG'),
    coordinator: 'Baez Haydeé',
    coordinatorSchedule: 'Martes 16 a 18 hs.',
    description:
      'El Técnico en Enfermería es un profesional esencial en el cuidado de la salud y en la promoción del bienestar integral de las personas, familias y comunidades. Su formación lo prepara para desempeñar un rol asistencial y humanizado, basado en sólidos conocimientos científicos, técnicos y éticos.\n\nEl enfermero técnico constituye un pilar fundamental del equipo de salud, participando activamente en la atención, prevención, recuperación y rehabilitación de los pacientes en diferentes niveles de complejidad. Durante su formación adquiere competencias que le permiten integrarse eficazmente en hospitales, centros de salud, instituciones educativas y comunitarias.',
  },
  {
    name: 'Gestión de Energías Renovables',
    degree: 'Técnico/a Superior en Gestión de Energías Renovables',
    area: AREAS.energy,
    studyPlanUrl: drive('1UXTw773mycmmrvqIRCdzAvplrNYf2-XW'),
    coordinator: 'Villarroel Carla',
    coordinatorSchedule: 'Martes 19:40 a 21:10 hs.',
    description:
      'La Tecnicatura Superior en Gestión de Energías Renovables, nueva en el Instituto de Educación Superior N° 11, forma profesionales para gestionar y optimizar el uso de las energías renovables. Es una carrera que tiene un presente, un futuro y una amplia salida laboral.\n\nEl objetivo de la carrera es preparar a profesionales con una sólida formación en la gestión de energías renovables, la eficiencia energética y el cuidado del medio ambiente, con capacidad para trabajar de forma autónoma a nivel local y regional.',
  },
  {
    name: 'Estadística de Salud',
    degree: 'Técnico/a Superior en Estadísticas de Salud',
    area: AREAS.health,
    studyPlanUrl: drive('1NeucFMOCvtPYQCwaoMWmtSdkIesOZB1j'),
    coordinator: 'Vega Eduardo',
    coordinatorSchedule: 'Miércoles 18:15 a 20:15 hs.',
    description:
      'La Estadística se ha convertido en una herramienta básica y esencial para el trabajo profesional, particularmente en la investigación científica en el área de la salud. En este contexto, la carrera de Técnico Superior en Estadísticas de Salud se constituye como una estrategia para formar recursos humanos capacitados en la aplicación de la Estadística a la problemática de salud: como herramienta para su mejor interpretación y para participar activamente en los procesos de investigación científica sobre salud y enfermedad, como es el caso de la Epidemiología.',
  },
  {
    name: 'Gerontología',
    degree: 'Técnico/a Superior en Gerontología',
    area: AREAS.health,
    studyPlanUrl: drive('1WtdBTCyCsSrX6WQePUSzSY9zIzVs9l2h'),
    coordinator: 'Carretero Virginia',
    coordinatorSchedule: 'Martes 19:00 a 21:00 hs. · Viernes 21:10 a 23:20 hs.',
    description:
      'La Tecnicatura Superior en Gerontología es una carrera que se hace, se construye y se aplica con compromiso y respeto hacia los adultos mayores, y que significa para quienes la estudian un compromiso de por vida dedicado a mejorar su calidad de vida. La gerontología incide en la calidad y las condiciones de vida del adulto mayor mediante el diseño, la ejecución y el seguimiento de políticas y programas destinados a esa población.\n\nEl aumento de la población adulta mayor exige más cuidados, atención específica y profesionales técnicos capacitados desde la teoría y la práctica para el buen trato, con una mirada profesional y de contención afectiva.',
  },
  {
    name: 'Higiene y Seguridad en el Trabajo',
    degree: 'Técnico/a Superior en Higiene y Seguridad en el Trabajo',
    area: AREAS.energy,
    studyPlanUrl: drive('1X9-uzUNCYUhzz3BHZGZlr1UzlXDyH-96'),
    coordinator: 'Ruiz Gilda Marcela',
    coordinatorSchedule: 'Jueves 19:00 a 21:10 hs.',
    description:
      'El Técnico Superior en Higiene y Seguridad en el Trabajo tiene como objetivo prevenir, promover y proteger la salud y seguridad de los trabajadores, instalando una cultura de la seguridad que favorezca la reducción de riesgos derivados del ámbito laboral. Así, analiza y evalúa ambientes de trabajo para detectar riesgos causantes de accidentes y enfermedades profesionales, para luego trazar planes de acción que reduzcan los riesgos identificados. "Protege vidas, crea futuro".',
  },
  {
    name: 'Laboratorio de Análisis Clínicos',
    degree: 'Técnico/a Superior en Laboratorio de Análisis Clínicos',
    area: AREAS.health,
    studyPlanUrl: drive('16McVJiaQR0K9P3NrwTiErA_NF-JgxMu7'),
    coordinator: 'Ramos Hebe',
    coordinatorSchedule: 'Miércoles 19:40 a 21:40 hs.',
    description:
      'Esta Tecnicatura perfila la formación de profesionales técnicos esenciales, que constituyen un pilar fundamental en el trabajo en equipo de la salud. El ejercicio del técnico superior se sustenta en sus conocimientos y capacidades para la ejecución y el análisis crítico de todas las actividades que se requieren en un laboratorio clínico, con el propósito de llegar a un diagnóstico, tratamiento y control de distintas patologías.',
  },
  {
    name: 'Turismo',
    degree: 'Técnico/a Superior en Turismo',
    area: AREAS.tourism,
    studyPlanUrl: drive('1doNkzT86owW4snPiHSq9hDKS8VYGqTx1'),
    coordinator: 'Nuñez Guadalupe',
    coordinatorSchedule: 'Lunes 15:30 a 17:30 hs.',
    description:
      'La propuesta se basa en la formación de profesionales con capacidades y competencias para desempeñarse con eficiencia como promotores y gestores de la actividad turística. El Técnico Superior en Turismo comprende la actividad turística como un todo, conociendo sus impactos sociales, culturales, económicos y ambientales, y su potencial a través de procesos participativos de los distintos actores sociales, regionales, provinciales y nacionales.\n\nLa carrera brinda herramientas para diagnosticar, diseñar y organizar emprendimientos turísticos en ámbitos privados y públicos, generando proyectos que reconozcan la naturaleza social y económica de los fenómenos turísticos.',
  },
].map((c, i) => ({ ...careerBase, ...c, order: i + 1 }));

// ─── Procedures: enrollment requirements, exam permits, admitted list ───
const procedures = [
  {
    title: 'Requisitos de matriculación — 1° año',
    status: 'abierto',
    icon: 'document',
    order: 1,
    description:
      'Documentación que deben presentar los alumnos de 1° año al momento de matricularse (Ciclo Lectivo 2026). El formulario de inscripción impreso es obligatorio y se descarga desde la Fan Page de Facebook del Instituto.',
    requirements: [
      'Título secundario autenticado por el departamento de títulos, o constancia de título en trámite, o certificado de culminación de estudios (aunque deba materias).',
      'Si tenés el título autenticado con fecha 2025, todavía está vigente.',
      'Certificado de nacimiento actualizado (se tramita en el Registro Civil).',
      'Carnet sanitario emitido por el Ministerio de Salud (turno en tu.jujuy.gob.ar).',
      'Certificado de residencia (por internet en el sitio de la Policía de la Provincia o en la comisaría que corresponda a tu domicilio).',
      '2 fotos tipo carnet 4x4 (al dorso: nombre y carrera).',
      'Carpeta colgante de plástico y un folio oficio.',
      'Formulario de inscripción IMPRESO (obligatorio).',
    ],
    schedule: 'Formulario disponible en la Fan Page de Facebook del IES N° 11.',
  },
  {
    title: 'Requisitos de matriculación — 2° y 3° año',
    status: 'abierto',
    icon: 'document',
    order: 2,
    description:
      'Los alumnos de 2° y 3° año, al momento de matricularse, deben presentar ÚNICAMENTE el formulario de inscripción impreso. Es un requisito obligatorio.',
    requirements: ['Formulario de inscripción IMPRESO (obligatorio).'],
    schedule: 'Formulario disponible en la Fan Page de Facebook del IES N° 11.',
  },
  {
    title: 'Permisos de examen',
    status: 'cerrado',
    icon: 'diploma',
    order: 3,
    description:
      'Solicitud de permisos de examen para las mesas de Febrero-Marzo de las carreras con Ciclo Lectivo Marzo (ICL Marzo): jueves 19 y viernes 20 de febrero de 2026. Las mesas se realizan en 2 llamados: 1° del 23 de febrero al 5 de marzo y 2° del 9 al 20 de marzo de 2026.',
    requirements: ['Recibo de matriculación (para certificar tu situación académica).'],
    schedule: '8 a 12 hs Preceptoría (Prof. Gabriela Miranda) · 14 a 17 hs Preceptoría (Prof. Delia Ferrufino) · 16 a 22 hs Mesa de Entradas (Marta Salva)',
  },
  {
    title: 'Lista de ingresantes',
    status: 'cerrado',
    icon: 'info',
    order: 4,
    description:
      'Al cierre de la preinscripción y del cursillo de ingreso se publica la lista de ingresantes por carrera. Descargala desde acá cuando esté disponible.',
    requirements: [],
    downloadLabel: 'Descargar lista de ingresantes',
    schedule: '',
  },
];

// ─── Exam boards: "Mesas de Examen Extraordinarias Octubre 2026" ────────
const OCT_2026 = 'Mesas Extraordinarias Octubre 2026';
const board = (career, subject, day, time, president, firstVocal, secondVocal, substitute) => ({
  session: OCT_2026,
  type: 'Extraordinaria',
  career,
  subject,
  date: new Date(`2026-10-${day}`),
  time,
  president,
  firstVocal,
  secondVocal,
  substitute,
  published: true,
});

const examBoards = [
  board('Enfermería', 'Integración de la Práctica Profesional', '22', '15', 'Puca Oscar', 'Flores Gladys', 'Reynoso Javier', 'Aguirre Claudia'),
  board('Enfermería', 'Integración de la Práctica Profesional Res 187', '22', '15', 'Puca Oscar', 'Flores Gladys', 'Reynoso Javier', 'Aguirre Claudia'),
  board('Enfermería', 'Práctica de Enfermería en Salud Mental y Psiquiátrica', '21', '15', 'Gramajo Lidia', 'Suarez Fabiana', 'Baez Hayde', 'Geronimo Analia'),
  board('Acompañamiento Terapéutico', 'Psicopatología III', '22', '19', 'Garzon Nora', 'Rodriguez Lucia', 'Cañiza Eugenia', 'Caceres Hugo'),
  board('Laboratorio de Análisis Clínicos', 'Fisiopatología', '22', '20', 'Barrientos Noemi', 'Vivanco Constanza', 'Gomez Claudio', 'Saavedra Duran Cesar'),
  board('Laboratorio de Análisis Clínicos', 'Bioquímica Clínica II', '22', '20:30', 'Ramos Hebe', 'Vivanco Constanza', 'Barrientos Noemi', 'Gomez Claudio'),
  board('Obstetricia', 'Prácticas III', '22', '18:30', 'Betancur', 'Garcia Santiago', 'Vaquera Noelia', ''),
];

// ─── Site settings (only the sections listed here are touched) ──────────
const settings = {
  'institutional.mission':
    'Formar profesionales técnicos de nivel superior competentes, mediante una educación de calidad, integral e inclusiva, que contribuya al desarrollo socioproductivo de Jujuy y de la región. Para ello, promovemos una formación que articula conocimientos, habilidades y prácticas profesionalizantes, favoreciendo el desarrollo de capacidades para la inserción laboral, el crecimiento profesional y el compromiso con la comunidad.',
  'institutional.vision':
    'Consolidarnos como una institución de Educación Superior innovadora, emprendedora y en crecimiento, reconocida por la calidad y pertinencia de sus propuestas formativas. Aspiramos a fortalecer una educación técnica superior vinculada con las necesidades del contexto, capaz de acompañar los cambios tecnológicos, sociales y productivos, y de generar nuevas oportunidades de formación y desarrollo para la comunidad.',
  'institutional.authorities': [
    { role: 'Rectora', name: 'Prof. Silvia Roxana Adaro' },
    { role: 'Vicerrectora', name: 'Prof. Noelia Fabiana Vaquera' },
    { role: 'Secretaria Administrativa', name: 'Prof. Marta Magdalena Mamaní' },
    { role: 'Secretario Académico', name: 'Prof. Santiago Milton García' },
  ],
  'contact.address': 'Alvear 1151, B° Centro, San Salvador de Jujuy',
  'preinscription.title': 'Preinscripción online — Plataforma Nexo',
  'preinscription.period': 'Del 15 de diciembre de 2025 al 13 de febrero de 2026',
  'preinscription.intro':
    'La preinscripción se realiza de forma virtual a través de la Plataforma Nexo: creá tu usuario y completá el "formulario digital". Después tenés que confirmar tu preinscripción en el Instituto presentando la documentación. Sin límite de cupos.',
  'preinscription.steps': [
    'Creá tu usuario en la Plataforma Nexo y completá el formulario digital de preinscripción.',
    'Imprimí el formulario Nexo completado.',
    'Confirmá tu preinscripción en el Edificio del IES N° 11 (Alvear 1151, B° Centro) de 8 a 12 hs o de 14 a 18 hs. Últimas fechas: jueves 19 y viernes 20 de febrero de 2026, sin excepción.',
    'Hacé el cursillo de ingreso: obligatorio y virtual, del 23 de febrero al 20 de marzo. La evaluación final es presencial y obligatoria.',
  ],
  'preinscription.requirements': [
    'Formulario Nexo completado (impreso)',
    'Fotocopia del DNI',
    'Fotocopia del título secundario (sin autenticar) o constancia de título en trámite / finalización del nivel secundario',
    'Bono de contribución: siete mil pesos ($7.000) en efectivo',
    'Toda la documentación en un folio oficio',
  ],
  'preinscription.note':
    'La preinscripción se completa cuando se entregan los papeles en la institución y se abona el bono contribución. La no presentación de la documentación en tiempo y forma anula la preinscripción online, quedando el aspirante excluido del proceso de admisión.',
};

// Contact fields filled only when they are still empty (never overwrite the admin's data).
const settingsIfEmpty = {
  'contact.phone': '388 601-4588',
  'contact.whatsapp': '5493886014588',
};

// ─── Validation & upsert ─────────────────────────────────────────────────
function validateAll() {
  const errors = [];
  const check = (Model, docs, label) =>
    docs.forEach((d) => {
      const err = new Model(d).validateSync();
      if (err) errors.push(`${label} "${d.name || d.title || d.subject}": ${Object.values(err.errors).map((e) => e.message).join('; ')}`);
    });
  check(Career, careers, 'Carrera');
  check(Procedure, procedures, 'Trámite');
  check(ExamBoard, examBoards, 'Mesa');
  const settingDoc = new Setting();
  Object.entries({ ...settings, ...settingsIfEmpty }).forEach(([path, value]) => settingDoc.set(path, value));
  const settingErr = settingDoc.validateSync();
  if (settingErr) errors.push(`Configuración: ${Object.values(settingErr.errors).map((e) => e.message).join('; ')}`);
  return errors;
}

async function upsert(Model, docs, keyOf, label) {
  let created = 0;
  let updated = 0;
  for (const data of docs) {
    const doc = await Model.findOne(keyOf(data));
    if (doc) {
      doc.set(data);
      await doc.save();
      updated += 1;
    } else {
      await Model.create(data);
      created += 1;
    }
  }
  console.info(`  ✓ ${label}: ${created} creados, ${updated} actualizados.`);
}

async function run() {
  const errors = validateAll();
  if (errors.length) {
    errors.forEach((e) => console.error(`  ✗ ${e}`));
    throw new Error(`${errors.length} registro(s) no pasan la validación`);
  }
  console.info(`[import] Datos válidos: ${careers.length} carreras, ${procedures.length} trámites, ${examBoards.length} mesas.`);
  if (DRY_RUN) return console.info('[import] --dry-run: no se escribió nada.');

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/ies11';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  console.info(`[import] Conectado a ${mongoose.connection.name}`);

  await upsert(Career, careers, (c) => ({ name: c.name }), 'Carreras');
  const hidden = await Career.updateMany({ name: { $nin: careers.map((c) => c.name) }, active: true }, { $set: { active: false } });
  if (hidden.modifiedCount) console.info(`  · ${hidden.modifiedCount} carrera(s) fuera de la oferta oficial quedaron ocultas (no se borraron).`);

  await upsert(Procedure, procedures, (p) => ({ title: p.title }), 'Trámites');
  await upsert(ExamBoard, examBoards, (b) => ({ session: b.session, career: b.career, subject: b.subject }), 'Mesas de examen');

  const site = await Setting.getSingleton();
  Object.entries(settings).forEach(([path, value]) => site.set(path, value));
  Object.entries(settingsIfEmpty).forEach(([path, value]) => {
    if (!site.get(path)) site.set(path, value);
  });
  await site.save();
  console.info('  ✓ Configuración: institucional, dirección y preinscripción actualizadas.');

  console.info('[import] Listo.');
}

run()
  .catch((err) => {
    console.error('[import] Error:', err.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
