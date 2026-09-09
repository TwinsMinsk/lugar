import type { RichTextNode } from '@/content/i18n';
import type { Locale } from '@/i18n/routing';

/**
 * The privacy and cookie texts, in one place.
 *
 * Drafts for a lawyer, not legal advice — every page that renders them keeps
 * `showTemplateNotice` on until somebody qualified has read them, and the
 * places only the studio can fill are left as bracketed placeholders rather
 * than plausible-looking inventions. A policy naming the wrong legal entity is
 * worse than one that visibly has a blank in it.
 *
 * What makes these worth a lawyer's time rather than a search result is that
 * they describe *this* site: the exact fields the form collects
 * (`features/leads/schema.ts`), the exact cookies it writes and for how long
 * (`features/consent/consent.ts`, `features/attribution/attribution.ts`), where
 * it is hosted (`railway.json` — europe-west4, the Netherlands), and which
 * processors actually receive anything. Every retention period is marked as a
 * proposal, because that is a business decision the studio makes and the
 * lawyer checks against Spanish commercial and tax law.
 *
 * They live in code rather than in the panel because a `legal_rich_text` block
 * has no editable fields there — see `scripts/apply-legal-texts.ts` for how a
 * revised text reaches an existing site.
 */

type Doc = { type: 'doc'; content: RichTextNode[] };

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

const h = (level: 2 | 3, text: string) => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

const ul = (items: string[]) => ({
  type: 'bulletList',
  content: items.map((item) => ({
    type: 'listItem',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
  })),
});

const doc = (...nodes: RichTextNode[]): Doc => ({ type: 'doc', content: nodes });

/**
 * What the studio has to fill in before this can be published.
 *
 * Kept as literal bracketed text inside the drafts so that an unreplaced one is
 * impossible to miss on the page — and so a search for "[" finds every
 * outstanding decision at once.
 */
export const LEGAL_PLACEHOLDERS = [
  '[ЮРИДИЧЕСКОЕ НАИМЕНОВАНИЕ]',
  '[NIF/CIF]',
  '[ЮРИДИЧЕСКИЙ АДРЕС]',
  '[EMAIL ДЛЯ ЗАПРОСОВ]',
] as const;

const NAME = '[ЮРИДИЧЕСКОЕ НАИМЕНОВАНИЕ]';
const NIF = '[NIF/CIF]';
const ADDRESS = '[ЮРИДИЧЕСКИЙ АДРЕС]';
const EMAIL = '[EMAIL ДЛЯ ЗАПРОСОВ]';

// ---------------------------------------------------------------------------
// Privacy
// ---------------------------------------------------------------------------

const privacyRu = doc(
  p(
    `Эта политика объясняет, какие персональные данные собирает сайт LUGAR, зачем, на каком правовом основании и как долго они хранятся. Она составлена в соответствии с Регламентом (ЕС) 2016/679 (GDPR) и испанским законом LOPDGDD 3/2018.`,
  ),

  h(2, 'Кто обрабатывает данные'),
  p(
    `Ответственный за обработку (responsable del tratamiento): ${NAME}, NIF ${NIF}, адрес: ${ADDRESS}. Вопросы по обработке персональных данных и любые запросы, связанные с вашими правами: ${EMAIL}.`,
  ),
  p(
    `Ответственный не назначил представителя по защите данных (DPO): характер и объём обработки не подпадают под случаи, когда назначение обязательно по статье 37 GDPR.`,
  ),

  h(2, 'Какие данные мы собираем'),
  p('Через форму заявки на сайте:'),
  ul([
    'имя — как к вам обращаться;',
    'номер телефона — единственный обязательный способ связи;',
    'город и комментарий к заявке — если вы их указали;',
    'выбранная услуга и ориентировочный бюджет — если вы их указали;',
    'ваши отметки о согласии: на обработку данных и, отдельно, на переписку в WhatsApp.',
  ]),
  p('Автоматически, когда вы пользуетесь сайтом:'),
  ul([
    'технические данные запроса: IP-адрес, тип браузера, страницы, которые открывались, — в журналах сервера;',
    'источник перехода (UTM-метки, адрес страницы, с которой вы пришли) — только если вы дали согласие на маркетинговые cookie;',
    'ваш выбор в баннере cookie — чтобы не спрашивать повторно.',
  ]),
  p(
    'Если вы пишете нам в WhatsApp, мы храним переписку с вами, чтобы вести обсуждение заказа. Мы не собираем специальные категории данных (о здоровье, взглядах, происхождении) и просим не указывать их в комментарии к заявке.',
  ),

  h(2, 'Зачем и на каком основании'),
  ul([
    'Ответить на заявку, подготовить расчёт и обсудить заказ — статья 6(1)(b) GDPR: меры, предпринимаемые по вашей просьбе до заключения договора.',
    'Переписка в WhatsApp — статья 6(1)(a): ваше отдельное согласие, отмеченное в форме. Его можно отозвать в любой момент.',
    'Аналитика посещаемости и маркетинговые cookie — статья 6(1)(a): согласие, которое вы даёте в баннере и можете изменить через «Настройки cookie» в подвале сайта.',
    'Ведение клиентской истории и учёт выполненных работ — статья 6(1)(b) и 6(1)(c): исполнение договора и обязанности по хранению документов.',
    'Защита сайта от автоматических рассылок и злоупотреблений, журнал действий в панели управления — статья 6(1)(f): законный интерес в безопасности собственной системы.',
  ]),

  h(2, 'Кому передаются данные'),
  p(
    'Мы не продаём персональные данные и не передаём их третьим лицам для их собственных целей. К данным имеют доступ поставщики услуг, которые действуют по нашему поручению (encargados del tratamiento):',
  ),
  ul([
    'Railway — хостинг сайта и базы данных; серверы расположены в Европейском союзе (Нидерланды);',
    'Resend — отправка служебных писем (уведомление о новой заявке, приглашение сотрудника);',
    'Meta Platforms Ireland — переписка в WhatsApp Business, если вы согласились на неё;',
    'Google Ireland — аналитика посещаемости, только после вашего согласия;',
    'Meta Platforms Ireland — рекламный пиксель, только после вашего согласия на маркетинг.',
  ]),
  p(
    'Часть этих компаний может передавать данные за пределы Европейской экономической зоны. Такие передачи опираются на стандартные договорные условия Европейской комиссии и, где применимо, на решение об адекватности уровня защиты. По запросу мы сообщим, какие гарантии применяются.',
  ),

  h(2, 'Сколько мы храним данные'),
  p(
    'Сроки ниже — предложение студии; окончательные сроки подтверждает юрист с учётом коммерческого и налогового законодательства Испании.',
  ),
  ul([
    'Заявка, которая не привела к заказу, — [3 года] с последнего обращения;',
    'Данные клиента и история заказов — [6 лет] после завершения последнего заказа (срок хранения коммерческой документации);',
    'Записи о согласиях — весь срок обработки и [3 года] после его окончания, как доказательство того, что согласие было дано;',
    'Журнал действий в панели управления — [2 года];',
    'Cookie — сроки указаны в политике cookie: 180 дней для записи вашего выбора и 365 дней для маркетинговой атрибуции.',
  ]),

  h(2, 'Ваши права'),
  p('Вы вправе в любой момент потребовать:'),
  ul([
    'доступ к своим данным и копию того, что мы храним;',
    'исправление неточных данных;',
    'удаление данных, когда для их хранения нет законного основания;',
    'ограничение обработки и возражение против неё;',
    'перенос данных другому поставщику в машиночитаемом виде;',
    'отзыв согласия — это не влияет на законность обработки до отзыва.',
  ]),
  p(
    `Чтобы воспользоваться любым из этих прав, напишите на ${EMAIL}. Мы ответим в течение одного месяца. Если ответ вас не устроит, вы можете подать жалобу в испанское Агентство по защите данных (Agencia Española de Protección de Datos, C/ Jorge Juan 6, 28001 Madrid, www.aepd.es).`,
  ),

  h(2, 'Безопасность'),
  p(
    'Сайт работает по HTTPS, пароли сотрудников хранятся в виде необратимых хешей, доступ к данным клиентов имеют только сотрудники студии, каждому из которых выдана отдельная учётная запись с ограниченными правами. Действия в панели управления записываются в журнал.',
  ),

  h(2, 'Изменения'),
  p(
    'Если политика изменится, мы обновим дату ниже и, при существенных изменениях, попросим согласие заново.',
  ),
);

const privacyEs = doc(
  p(
    `Esta política explica qué datos personales recoge el sitio de LUGAR, con qué finalidad, sobre qué base jurídica y durante cuánto tiempo se conservan. Está redactada conforme al Reglamento (UE) 2016/679 (RGPD) y a la Ley Orgánica 3/2018 (LOPDGDD).`,
  ),

  h(2, 'Responsable del tratamiento'),
  p(
    `${NAME}, NIF ${NIF}, con domicilio en ${ADDRESS}. Para cualquier cuestión relativa al tratamiento de datos o para ejercer tus derechos: ${EMAIL}.`,
  ),
  p(
    'No se ha designado delegado de protección de datos: por la naturaleza y el volumen del tratamiento no concurre ninguno de los supuestos del artículo 37 del RGPD.',
  ),

  h(2, 'Qué datos recogemos'),
  p('A través del formulario de la web:'),
  ul([
    'nombre, para saber cómo dirigirnos a ti;',
    'teléfono, la única vía de contacto obligatoria;',
    'ciudad y comentario, si los indicas;',
    'servicio de interés y presupuesto orientativo, si los indicas;',
    'tus consentimientos: al tratamiento de datos y, por separado, a conversar por WhatsApp.',
  ]),
  p('De forma automática, al navegar:'),
  ul([
    'datos técnicos de la petición —dirección IP, navegador, páginas visitadas— en los registros del servidor;',
    'origen de la visita (parámetros UTM, página de procedencia), solo si aceptas las cookies de marketing;',
    'tu elección en el banner de cookies, para no volver a preguntártelo.',
  ]),
  p(
    'Si nos escribes por WhatsApp, conservamos la conversación para poder tratar tu encargo. No recogemos categorías especiales de datos (salud, opiniones, origen) y te pedimos que no los incluyas en el comentario.',
  ),

  h(2, 'Finalidades y bases jurídicas'),
  ul([
    'Responder a tu solicitud, preparar un presupuesto y hablar del encargo — artículo 6(1)(b) RGPD: medidas precontractuales adoptadas a petición tuya.',
    'Conversación por WhatsApp — artículo 6(1)(a): consentimiento específico marcado en el formulario, revocable en cualquier momento.',
    'Analítica de audiencia y cookies de marketing — artículo 6(1)(a): el consentimiento del banner, modificable desde «Preferencias de cookies» en el pie.',
    'Historial de cliente y registro de trabajos realizados — artículos 6(1)(b) y 6(1)(c): ejecución del contrato y obligaciones de conservación.',
    'Protección frente a envíos automatizados y registro de actividad del panel — artículo 6(1)(f): interés legítimo en la seguridad del propio sistema.',
  ]),

  h(2, 'Destinatarios'),
  p(
    'No vendemos datos personales ni los cedemos a terceros para sus propios fines. Acceden a ellos los proveedores que actúan como encargados del tratamiento por cuenta nuestra:',
  ),
  ul([
    'Railway — alojamiento de la web y de la base de datos; servidores en la Unión Europea (Países Bajos);',
    'Resend — envío de correos de servicio (aviso de nueva solicitud, invitación de personal);',
    'Meta Platforms Ireland — conversación por WhatsApp Business, si lo has consentido;',
    'Google Ireland — analítica de audiencia, solo tras tu consentimiento;',
    'Meta Platforms Ireland — píxel publicitario, solo tras tu consentimiento de marketing.',
  ]),
  p(
    'Alguno de estos proveedores puede transferir datos fuera del Espacio Económico Europeo. Dichas transferencias se amparan en las cláusulas contractuales tipo de la Comisión Europea y, cuando proceda, en una decisión de adecuación. Te informaremos de las garantías aplicables si lo solicitas.',
  ),

  h(2, 'Plazos de conservación'),
  p(
    'Los plazos siguientes son una propuesta del estudio; los definitivos los confirma el asesor legal a la vista de la normativa mercantil y fiscal española.',
  ),
  ul([
    'Solicitud que no llega a encargo — [3 años] desde el último contacto;',
    'Datos de cliente e historial de encargos — [6 años] desde la finalización del último (conservación de documentación mercantil);',
    'Registros de consentimiento — durante todo el tratamiento y [3 años] después, como prueba de que se prestó;',
    'Registro de actividad del panel — [2 años];',
    'Cookies — los plazos figuran en la política de cookies: 180 días para tu elección y 365 días para la atribución de marketing.',
  ]),

  h(2, 'Tus derechos'),
  p('Puedes solicitar en cualquier momento:'),
  ul([
    'acceso a tus datos y copia de lo que conservamos;',
    'rectificación de los datos inexactos;',
    'supresión cuando no exista base que justifique conservarlos;',
    'limitación del tratamiento y oposición al mismo;',
    'portabilidad en un formato legible por máquina;',
    'retirada del consentimiento, sin que ello afecte a la licitud del tratamiento previo.',
  ]),
  p(
    `Para ejercerlos escribe a ${EMAIL}. Responderemos en el plazo de un mes. Si la respuesta no te satisface, puedes reclamar ante la Agencia Española de Protección de Datos (C/ Jorge Juan 6, 28001 Madrid, www.aepd.es).`,
  ),

  h(2, 'Seguridad'),
  p(
    'La web funciona sobre HTTPS, las contraseñas del personal se guardan como resúmenes irreversibles, y solo acceden a los datos de clientes las personas del estudio, cada una con su propia cuenta y permisos limitados. Las acciones en el panel quedan registradas.',
  ),

  h(2, 'Cambios'),
  p(
    'Si esta política cambia, actualizaremos la fecha que figura abajo y, ante cambios sustanciales, volveremos a solicitar tu consentimiento.',
  ),
);

const privacyEn = doc(
  p(
    `This policy explains what personal data the LUGAR website collects, why, on what legal basis and for how long it is kept. It is written under Regulation (EU) 2016/679 (GDPR) and Spanish Organic Law 3/2018 (LOPDGDD).`,
  ),

  h(2, 'Who processes the data'),
  p(
    `Controller: ${NAME}, NIF ${NIF}, registered at ${ADDRESS}. For anything about how your data is handled, or to exercise your rights: ${EMAIL}.`,
  ),
  p(
    'No data protection officer has been appointed: the nature and scale of the processing do not meet the conditions in Article 37 GDPR.',
  ),

  h(2, 'What we collect'),
  p('Through the enquiry form:'),
  ul([
    'your name, so we know how to address you;',
    'your phone number, the only contact detail we require;',
    'city and a comment, if you provide them;',
    'the service you are interested in and an indicative budget, if you provide them;',
    'your consents: to the processing of your data and, separately, to talking on WhatsApp.',
  ]),
  p('Automatically, as you browse:'),
  ul([
    'technical request data — IP address, browser, pages visited — in server logs;',
    'where your visit came from (UTM parameters, referring page), only if you accept marketing cookies;',
    'your choice in the cookie banner, so you are not asked again.',
  ]),
  p(
    'If you write to us on WhatsApp we keep the conversation so we can deal with your order. We do not collect special categories of data (health, opinions, origin) and ask you not to include them in the comment field.',
  ),

  h(2, 'Purposes and legal bases'),
  ul([
    'Answering your enquiry, preparing a quote and discussing the work — Article 6(1)(b) GDPR: steps taken at your request before entering a contract.',
    'WhatsApp conversation — Article 6(1)(a): the separate consent you tick on the form, which you may withdraw at any time.',
    'Audience analytics and marketing cookies — Article 6(1)(a): the consent given in the banner and changeable from "Cookie preferences" in the footer.',
    'Customer history and a record of completed work — Articles 6(1)(b) and 6(1)(c): performance of the contract and record-keeping obligations.',
    'Protection against automated submissions and the admin activity log — Article 6(1)(f): our legitimate interest in the security of our own system.',
  ]),

  h(2, 'Who receives the data'),
  p(
    'We do not sell personal data and do not pass it to third parties for their own purposes. It is accessible to service providers acting on our instructions:',
  ),
  ul([
    'Railway — hosting for the site and the database; servers in the European Union (Netherlands);',
    'Resend — service email (new enquiry alerts, staff invitations);',
    'Meta Platforms Ireland — WhatsApp Business conversation, if you consented to it;',
    'Google Ireland — audience analytics, only after your consent;',
    'Meta Platforms Ireland — advertising pixel, only after your marketing consent.',
  ]),
  p(
    'Some of these providers may transfer data outside the European Economic Area. Such transfers rely on the European Commission’s standard contractual clauses and, where applicable, on an adequacy decision. We will tell you which safeguards apply if you ask.',
  ),

  h(2, 'How long we keep it'),
  p(
    'The periods below are the studio’s proposal; the final ones are confirmed by a lawyer against Spanish commercial and tax law.',
  ),
  ul([
    'An enquiry that did not become an order — [3 years] from the last contact;',
    'Customer details and order history — [6 years] after the last order was completed (commercial record retention);',
    'Consent records — for the whole processing period and [3 years] afterwards, as evidence that consent was given;',
    'Admin activity log — [2 years];',
    'Cookies — durations are listed in the cookie policy: 180 days for your choice, 365 days for marketing attribution.',
  ]),

  h(2, 'Your rights'),
  p('You may at any time ask for:'),
  ul([
    'access to your data and a copy of what we hold;',
    'correction of anything inaccurate;',
    'erasure where there is no lawful basis to keep it;',
    'restriction of processing, and objection to it;',
    'portability in a machine-readable form;',
    'withdrawal of consent, which does not affect processing carried out before you withdrew it.',
  ]),
  p(
    `To exercise any of these, write to ${EMAIL}. We answer within one month. If our answer does not satisfy you, you may complain to the Spanish Data Protection Agency (Agencia Española de Protección de Datos, C/ Jorge Juan 6, 28001 Madrid, www.aepd.es).`,
  ),

  h(2, 'Security'),
  p(
    'The site runs over HTTPS, staff passwords are stored as irreversible hashes, and customer data is reachable only by the studio’s own people, each with their own account and limited permissions. Actions taken in the admin panel are logged.',
  ),

  h(2, 'Changes'),
  p(
    'If this policy changes we will update the date below and, for substantial changes, ask for your consent again.',
  ),
);

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

const cookiesRu = doc(
  p(
    'Cookie — небольшие файлы, которые сайт сохраняет в вашем браузере. Ниже перечислено всё, что сохраняет этот сайт, зачем и на какой срок. Категории здесь — те же самые, что и в баннере согласия: ваш выбор в баннере управляет именно этим списком.',
  ),

  h(2, 'Необходимые'),
  p(
    'Устанавливаются всегда: без них сайт не может выполнить то, ради чего вы на него пришли. Согласия не требуют.',
  ),
  ul([
    'lg_consent — ваш собственный выбор в баннере и его дата, чтобы не спрашивать повторно. 180 дней;',
    'NEXT_LOCALE — язык, который вы выбрали переключателем. До закрытия браузера или до смены языка;',
    'better-auth.session_token — только для сотрудников студии, вошедших в панель управления. 7 дней.',
  ]),

  h(2, 'Аналитические'),
  p(
    'Устанавливаются только после того, как вы согласились на аналитику. Помогают понять, какие страницы читают и где посетители теряются.',
  ),
  ul(['_ga, _ga_* — Google Analytics, различает посетителей между визитами. До 2 лет.']),
  p(
    'Пока владелец не подключил аналитику, эти файлы не устанавливаются, даже если вы согласились: сначала соглашаетесь вы, потом включает владелец, и только тогда скрипт загружается.',
  ),

  h(2, 'Маркетинговые'),
  p('Устанавливаются только после согласия на маркетинг.'),
  ul([
    'lg_attr — источник, из которого вы впервые попали на сайт (рекламная кампания, поисковая система, ссылка с другого сайта). Нужен, чтобы понимать, какая реклама приводит заказы. Не передаётся третьим лицам. 365 дней;',
    '_fbp — рекламный пиксель Meta, позволяет оценивать эффективность рекламы. До 90 дней.',
  ]),

  h(2, 'Как изменить выбор'),
  p(
    'Ссылка «Настройки cookie» в подвале сайта открывает баннер заново — там можно как дать согласие, так и отозвать его. Отзыв действует сразу: скрипты перестают загружаться, а файлы, которые уже стоят, можно удалить средствами браузера.',
  ),
  p(
    'Отказ от аналитических и маркетинговых cookie никак не влияет на возможность отправить заявку и получить расчёт.',
  ),
);

const cookiesEs = doc(
  p(
    'Las cookies son pequeños archivos que la web guarda en tu navegador. A continuación está todo lo que guarda este sitio, para qué y durante cuánto tiempo. Las categorías son las mismas del banner de consentimiento: tu elección allí gobierna exactamente esta lista.',
  ),

  h(2, 'Necesarias'),
  p(
    'Se instalan siempre: sin ellas la web no puede hacer aquello para lo que has entrado. No requieren consentimiento.',
  ),
  ul([
    'lg_consent — tu elección en el banner y su fecha, para no volver a preguntarte. 180 días;',
    'NEXT_LOCALE — el idioma que has elegido en el selector. Hasta cerrar el navegador o cambiar de idioma;',
    'better-auth.session_token — solo para el personal del estudio con sesión en el panel. 7 días.',
  ]),

  h(2, 'Analíticas'),
  p(
    'Se instalan únicamente tras aceptar la analítica. Sirven para saber qué páginas se leen y dónde se pierde la gente.',
  ),
  ul(['_ga, _ga_* — Google Analytics, distingue visitantes entre visitas. Hasta 2 años.']),
  p(
    'Mientras el estudio no active la analítica, estos archivos no se instalan aunque hayas aceptado: primero aceptas tú, después lo activa el estudio, y solo entonces se carga el script.',
  ),

  h(2, 'De marketing'),
  p('Se instalan únicamente tras aceptar el marketing.'),
  ul([
    'lg_attr — el origen por el que llegaste por primera vez (campaña, buscador, enlace de otra web). Sirve para saber qué publicidad trae encargos. No se cede a terceros. 365 días;',
    '_fbp — píxel publicitario de Meta, permite medir la eficacia de los anuncios. Hasta 90 días.',
  ]),

  h(2, 'Cómo cambiar tu elección'),
  p(
    '«Preferencias de cookies», en el pie de la web, vuelve a abrir el banner: desde ahí puedes aceptar o retirar el consentimiento. La retirada surte efecto de inmediato —los scripts dejan de cargarse— y los archivos ya instalados puedes borrarlos desde tu navegador.',
  ),
  p(
    'Rechazar las cookies analíticas y de marketing no afecta en absoluto a tu posibilidad de enviar una solicitud y recibir un presupuesto.',
  ),
);

const cookiesEn = doc(
  p(
    'Cookies are small files a website stores in your browser. Below is everything this site stores, what for and for how long. The categories are the ones in the consent banner: your choice there governs exactly this list.',
  ),

  h(2, 'Necessary'),
  p(
    'Always set: without them the site cannot do the thing you came for. They do not require consent.',
  ),
  ul([
    'lg_consent — your own choice in the banner and its date, so you are not asked again. 180 days;',
    'NEXT_LOCALE — the language you picked in the switcher. Until you close the browser or change language;',
    'better-auth.session_token — studio staff signed into the admin panel only. 7 days.',
  ]),

  h(2, 'Analytics'),
  p(
    'Set only after you accept analytics. They show which pages are read and where visitors lose their way.',
  ),
  ul(['_ga, _ga_* — Google Analytics, distinguishes visitors between visits. Up to 2 years.']),
  p(
    'Until the studio switches analytics on, these are not set even if you accepted: you consent first, the studio enables it second, and only then is the script loaded.',
  ),

  h(2, 'Marketing'),
  p('Set only after you accept marketing.'),
  ul([
    'lg_attr — where you first arrived from (an advertising campaign, a search engine, a link on another site). It exists so the studio can tell which advertising brings work. Not shared with third parties. 365 days;',
    '_fbp — Meta advertising pixel, used to measure how well adverts perform. Up to 90 days.',
  ]),

  h(2, 'Changing your mind'),
  p(
    '"Cookie preferences" in the site footer reopens the banner, where consent can be given or withdrawn. Withdrawal takes effect immediately — scripts stop loading — and files already stored can be cleared from your browser.',
  ),
  p(
    'Refusing analytics and marketing cookies has no effect on your ability to send an enquiry and get a quote.',
  ),
);

export const LEGAL_TEXTS: Record<
  'privacy' | 'cookies',
  { heading: Record<Locale, string>; content: Record<Locale, Doc> }
> = {
  privacy: {
    heading: {
      ru: 'Политика конфиденциальности',
      es: 'Política de privacidad',
      en: 'Privacy policy',
    },
    content: { ru: privacyRu, es: privacyEs, en: privacyEn },
  },
  cookies: {
    heading: { ru: 'Файлы cookie', es: 'Cookies', en: 'Cookies' },
    content: { ru: cookiesRu, es: cookiesEs, en: cookiesEn },
  },
};
