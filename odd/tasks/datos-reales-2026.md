Objective: load real IES N° 11 content (careers, exam boards, enrollment, procedures, coordinators) and add the missing sections.
Branch: main (user works on main, uncommitted) · Delivery: ask-on-risk · Test runner: none (node --check + model validateSync smoke checks).

## Specs

- S1 Careers: load the 13 tecnicaturas from the Drive brochures ("no tenemos profesorados, son tecnicaturas"), grouped by the official areas of 00_institucional.pdf: Salud y Atención a las Personas; Informática y Tecnología; Energía, Ambiente y Seguridad (Gestión de Energías Renovables, Higiene y Seguridad); Gastronomía y Cultura Alimentaria; Diseño e Indumentaria; Turismo y Servicios. Each: 3 years, official degree, description from its PDF, brochure PDF as study plan link.
- S2 Exam boards ("mesas extraordinarias ya que ese es su formato el de la primer imagen"): rows with Carrera, Materia, fecha (1er llamado), Hora, Titular, 1º Vocal, 2º Vocal, Suplente; manageable from admin and shown on the public site. Load the "Mesas de examen extraordinarias octubre 2026" rows from image 1.
- S3 Preinscription: fill with real info from the preinscription images (Plataforma Nexo, dates, documentation, horarios, lugar Alvear 1151 B° Centro, bono contribución, cursillo virtual obligatorio 23 feb–20 mar).
- S4 "requisitos de matriculación si no hay una sección de eso agregalo": 1° año requirements list + 2° y 3° año formulario impreso obligatorio.
- S5 Permiso de examen info (image 5) and cartillas de ingreso (existing Career.cursilloUrl field).
- S6 Horarios de coordinadores 2026 (image 6): coordinator name and schedule per career.
- S7 "cada carrera tiene canal de wpp no todas, algunas": optional WhatsApp channel link per career.
- S8 Institutional: mission, vision, authorities (equipo de gestión) from 00_institucional.pdf.
- S9 Lista de ingresantes: place to publish it (assumption: a Procedure/News with a PDF link, admin-managed).
- S10 (pending decision) Videos in news: YouTube link vs file upload — question asked, unanswered.

## Tasks

- [x] T1 S5,S6,S7 Career fields coordinator / coordinatorSchedule / whatsappChannelUrl; cursilloUrl now PDF upload ("Cartilla / cursillo de ingreso") — inline — uncommitted (user works uncommitted on main)
- [x] T2 S2 ExamBoard model + /api/exam-boards + admin "Mesas de examen" + public table under #calendario (filter by career, grouped by session) — inline — uncommitted
- [x] T3 S1,S3,S4,S5,S8,S9 scripts/import-real-data.js (`npm run import:real`, `--dry-run`): upsert, hides non-official careers — inline — dry-run OK; NOT run against DB (pending user OK)
- [x] T4 S10 Videos in news (file upload, kind "video" MP4/MOV/WebM ≤ 60 MB, News.videoUrl, player in news modal, play badge on card) — inline — uncommitted
- [x] T5 S11 Admin "Resumen" restyled like the reference dashboard (dark brand-gradient header, progress rings on ratio cards), same data/colors/logos — inline — uncommitted

## Log

- L1 (2026-11-13, user, verbatim): "Si yo te paso el drive de las propuestas para cargar lo podrias hacer asi lo hago mas rapido? lo que si no tenemos profesorados, son tecnicaturas. pero hay area de salud higiene y seguridad y tecnologia , energia renovable nose donde entraria https://drive.google.com/drive/folders/1abON3M7vBJWw_kKcZZN_42bNyg2KQVuA y te paso imagen de las carreras y tambien para que si creees que es necesario modifiques la mesas extraorinarias ya que ese es su formato el de la primer imagen tambien te pase las carreras en imagen y la informacion de las preencripciones para que tambien lo llenes con infromacion real tambien te paso los requsiitos de matriculacion si no hay una seccion de eso agregalo te paso un calendario academico y nose si tambein hay seccion para cartillas de ingreso permiso de examen , tambien vi que en facebook publican la lista deingresantes vi horarios de coordinadores y vi que cada carrera tiene canal de wpp no todas, algunas"
- L2 Evidence: Drive folder public; 14 PDFs (00_institucional + 13 careers). Career PDFs: page 1 text, "ESTRUCTURA CURRICULAR" is an image. 00_institucional gives areas, mission, vision, values, equipo de gestión, phone 3886014588, "Oferta educativa 2027".
- L4 Checks: node --check on all changed JS OK; import --dry-run: 13 careers, 4 procedures, 7 boards valid; probes: ExamBoard rejects time "25:00" and 2nd call before 1st; Career rejects javascript: channel URL. Not browser-tested. Skipped careers present only in the 2026 coordinators image (Asistencia Odontológica, Ciencia de Datos e IA, Hotelería, Museología, Tecnología de los Alimentos) because they are not in "Oferta educativa 2027". Board row 7 titular truncated in image ("BETANCUR, Marie…") → loaded as "Betancur".
- L5 (2026-11-13, user, verbatim): "a ver correlo vos" → ran `npm run import:real` on DB "ies11": 13 careers, 4 procedures, 7 boards created; 4 old careers hidden (2 profesorados + 2 duplicate-named tecnicaturas, none had uploaded files). Readback OK: 13 active in 6 areas, 4 authorities, phone/whatsapp filled.
- L6 (2026-11-13, user, verbatim): "Subiendo un archivo y el admin podrias hacerlo algo asi, tipo el resumen, lo que si no cambies lo colores ya que es la escencia de la pagina y logos" + on rejecting a bigger stats rewrite: "Lo que si me gusta como esta el dashboard solo hazlo parecido y si quiere agrega algunas cosas, no te compliques tanto". S10 → file upload. S11: restyle overview only, no backend change.
- L3 Note: today is 2026-11-13; images carry 2026 dates (Feb–Mar 2026, Oct 2026) that are already past. No academic-calendar image was attached (6 images: mesas, oferta, requisitos, preinscripción fechas, permisos de examen, coordinadores).
