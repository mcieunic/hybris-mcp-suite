/**
 * Groovy script builder for export_cms_page tool.
 *
 * Produces a read-only Groovy script that walks a ContentPage and returns
 * a JSON payload with:
 *   - main:      MAIN impex (media, restrictions, components, slots, page, ContentSlotForPage)
 *   - localized: { <lang>: "<impex>" } for each extra language
 *   - stats:     counters for logging
 *
 * The generated impex is written against a *target* catalog/version so the
 * output is ready to import into a different content catalog (CC swap).
 * Source catalog is only used to read data.
 */

export interface ExportCmsPageParams {
  pageUid: string;
  catalog: string;
  catalogVersion: string;
  baseLang: string;
  extraLangs: string[];
  targetCatalog: string;
  targetCatalogVersion: string;
}

function escGroovy(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function groovyStringList(values: string[]): string {
  return '[' + values.map((v) => '"' + escGroovy(v) + '"').join(', ') + ']';
}

export function buildExportCmsPageScript(p: ExportCmsPageParams): string {
  const CATALOG = escGroovy(p.catalog);
  const CAT_VERSION = escGroovy(p.catalogVersion);
  const PAGE_UID = escGroovy(p.pageUid);
  const BASE_LANG = escGroovy(p.baseLang);
  const EXTRA_LANGS = groovyStringList(p.extraLangs);
  const OUT_CATALOG = escGroovy(p.targetCatalog);
  const OUT_CAT_VER = escGroovy(p.targetCatalogVersion);

  // NOTE: Every `\${...}` in this template is a Groovy GString interpolation.
  // The `\$` escapes prevent TypeScript from evaluating those expressions.
  // Plain `$contentCV`, `$catalog`, etc. that must appear literally in the
  // emitted impex are escaped as `\\$contentCV` (Groovy literal `\$contentCV`
  // in the source, which writes `$contentCV` to the StringBuilder).
  return `
import de.hybris.platform.servicelayer.search.FlexibleSearchService
import de.hybris.platform.cms2.model.pages.ContentPageModel
import de.hybris.platform.cms2.model.contents.contentslot.ContentSlotModel
import de.hybris.platform.cms2.model.contents.components.AbstractCMSComponentModel
import de.hybris.platform.cms2.model.navigation.CMSNavigationNodeModel
import de.hybris.platform.cms2.model.navigation.CMSNavigationEntryModel
import de.hybris.platform.cms2.model.contents.components.CMSLinkComponentModel
import de.hybris.platform.core.model.media.MediaModel
import de.hybris.platform.core.model.media.MediaContainerModel
import groovy.json.JsonOutput

final String CATALOG       = "${CATALOG}"
final String CAT_VERSION   = "${CAT_VERSION}"
final String PAGE_UID      = "${PAGE_UID}"
final String BASE_LANG     = "${BASE_LANG}"
final List<String> EXTRA_LANGS = ${EXTRA_LANGS}
final String OUT_CATALOG   = "${OUT_CATALOG}"
final String OUT_CAT_VER   = "${OUT_CAT_VER}"

def fs = spring.getBean("flexibleSearchService") as FlexibleSearchService

def safeGet = { Closure c -> try { c() } catch (ignored) { null } }
def locGet  = { obj, String method, String lang ->
    safeGet { obj."\${method}"(new Locale(lang)) }
}
def quote = { Object v ->
    if (v == null) return ""
    def s = v.toString()
    if (s.isEmpty()) return ""
    '"' + s.replace('"', '""') + '"'
}
def cvExpr = { String cat, String ver ->
    "catalogVersion(CatalogVersion.catalog(Catalog.id[default=\${cat}]),CatalogVersion.version[default=\${ver}])[default=\${cat}:\${ver}]"
}
def boolStr = { Object v -> v == null ? "" : v.toString() }

// ── source CatalogVersion ────────────────────────────────────────────────────
def cvRes = fs.search(
        "SELECT {cv.pk} FROM {CatalogVersion AS cv JOIN Catalog AS c ON {cv.catalog}={c.pk}} " +
                "WHERE {c.id}=?cat AND {cv.version}=?ver",
        [cat: CATALOG, ver: CAT_VERSION])
if (!cvRes.result) throw new RuntimeException("CatalogVersion \${CATALOG}:\${CAT_VERSION} not found")
def cv = cvRes.result[0]

// ── locate page ──────────────────────────────────────────────────────────────
def r = fs.search(
        "SELECT {pk} FROM {ContentPage} WHERE {uid}=?uid AND {catalogVersion}=?cv",
        [uid: PAGE_UID, cv: cv])
if (!r.result) throw new RuntimeException("ContentPage uid=\${PAGE_UID} not found in \${CATALOG}:\${CAT_VERSION}")
ContentPageModel page = r.result[0] as ContentPageModel

// ── collectors ───────────────────────────────────────────────────────────────
def slots       = [] as LinkedHashSet
def allComps    = [] as LinkedHashSet
def compsByType = [:].withDefault { [] as LinkedHashSet }
def medias      = [] as LinkedHashSet
def mediaContainers = [] as LinkedHashSet
def navNodes    = [] as LinkedHashSet
def navEntries  = [] as LinkedHashSet
def restrictions = [] as LinkedHashSet

def registerMedia = { m ->
    if (m == null) return
    if (m instanceof MediaContainerModel) {
        mediaContainers.add(m)
        safeGet { m.medias }?.each { medias.add(it) }
    } else if (m instanceof MediaModel) {
        medias.add(m)
    }
}

def registerComp
def collectNode
registerComp = { AbstractCMSComponentModel comp ->
    if (comp == null) return
    if (!allComps.add(comp)) return
    compsByType[comp.itemtype].add(comp)
    safeGet { comp.restrictions }?.each { restrictions.add(it) }
    def navNode = safeGet { comp.navigationNode }
    if (navNode instanceof CMSNavigationNodeModel) collectNode(navNode)
    ["simpleCMSComponents", "components", "banners", "tabComponents",
     "rotatingImages", "productCarouselComponents", "cmsComponents"].each { relName ->
        safeGet { comp."\${relName}" }?.each { child ->
            if (child instanceof AbstractCMSComponentModel) registerComp(child)
        }
    }
    ["media", "desktopMedia", "mobileMedia", "tabletMedia",
     "wideMedia", "tabletLandscapeMedia", "tabletPortraitMedia",
     "mobileLandscapeMedia", "mobilePortraitMedia", "thumbnail",
     "image", "picture", "logo", "videoPreview"].each { relName ->
        registerMedia(safeGet { comp."\${relName}" })
    }
}
collectNode = { CMSNavigationNodeModel node ->
    if (!navNodes.add(node)) return
    node.children?.each { collectNode(it) }
    safeGet { node.links }?.each { registerComp(it) }
    node.entries?.each { entry ->
        navEntries.add(entry)
        def item = safeGet { entry.item }
        if (item instanceof AbstractCMSComponentModel) registerComp(item)
    }
}

def csfpRes = fs.search(
        "SELECT {pk} FROM {ContentSlotForPage} WHERE {page}=?p",
        [p: page])
def slotForPageRels = csfpRes.result ?: []
slotForPageRels.each { rel ->
    def slot = safeGet { rel.contentSlot }
    if (slot == null) return
    slots.add(slot)
    safeGet { slot.restrictions }?.each { restrictions.add(it) }
    slot.cmsComponents?.each { registerComp(it) }
}

safeGet { page.restrictions }?.each { restrictions.add(it) }

def addedOriginal = true
while (addedOriginal) {
    addedOriginal = false
    restrictions.collect { it }.each { rx ->
        def orig = safeGet { rx.originalRestriction }
        if (orig != null && restrictions.add(orig)) addedOriginal = true
    }
}

def parentByChildUid = [:]
navNodes.each { pn -> pn.children?.each { ch -> parentByChildUid[ch.uid] = pn.uid } }

// ── MAIN impex ───────────────────────────────────────────────────────────────
def main = new StringBuilder()
main << "# Export CMS page – MAIN IMPEX (target catalog)\\n"
main << "\\\$catalog        = " << OUT_CATALOG << "\\n"
main << "\\\$catalogVersion = " << OUT_CAT_VER << "\\n"
main << "\\\$contentCV      = " << cvExpr(OUT_CATALOG, OUT_CAT_VER) << "\\n"
main << "\\\$lang           = " << BASE_LANG << "\\n\\n"

// 1) Media (references)
if (medias) {
    main << "# ── Media (references – binaries must exist in target) ───────────────────────\\n\\n"
    main << "INSERT_UPDATE Media; \\\$contentCV[unique=true]; code[unique=true]; altText[lang=\\\$lang]; description[lang=\\\$lang]; mime\\n"
    medias.each { m ->
        def alt  = quote(locGet(m, "getAltText", BASE_LANG))
        def desc = quote(locGet(m, "getDescription", BASE_LANG))
        def mime = safeGet { m.mime } ?: ""
        main << "                  ;;" << m.code << ";" << alt << ";" << desc << ";" << mime << "\\n"
    }
    main << "\\n"
}

// 2) MediaContainer
if (mediaContainers) {
    main << "# ── MediaContainer ──────────────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE MediaContainer; \\\$contentCV[unique=true]; qualifier[unique=true]; medias(code, \\\$contentCV); name\\n"
    mediaContainers.each { mc ->
        def meds = (safeGet { mc.medias } ?: []).collect { it.code }.join(",")
        def nm = quote(safeGet { mc.name })
        main << "                           ;;" << mc.qualifier << ";" << meds << ";" << nm << "\\n"
    }
    main << "\\n"
}

// 3) Restrictions (non-inverse)
def userRestrictions    = restrictions.findAll { it.itemtype == "CMSUserRestriction" }
def inverseRestrictions = restrictions.findAll { it.itemtype == "CMSInverseRestriction" }
def otherRestrictions   = restrictions.findAll { !(it in userRestrictions) && !(it in inverseRestrictions) }

if (userRestrictions) {
    main << "# ── CMSUserRestriction ──────────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE CMSUserRestriction; \\\$contentCV[unique=true]; uid[unique=true]; name; users(uid)\\n"
    userRestrictions.each { ur ->
        def users = (safeGet { ur.users } ?: []).collect { it.uid }.join(",")
        main << "                                ;;" << ur.uid << ";" << quote(ur.name) << ";" << users << "\\n"
    }
    main << "\\n"
}

if (otherRestrictions) {
    main << "# ── CMS Restrictions (other) ────────────────────────────────────────────────\\n"
    otherRestrictions.each { or_ ->
        main << "INSERT_UPDATE " << or_.itemtype << "; \\\$contentCV[unique=true]; uid[unique=true]; name\\n"
        main << "                          ;;" << or_.uid << ";" << quote(or_.name) << "\\n"
    }
    main << "\\n"
}

// 4) Typed components
def cmsLinkComps   = compsByType["CMSLinkComponent"]
def locLinkComps   = compsByType["CMSLocalizedLinkComponent"]
def paragraphComps = compsByType["CMSParagraphComponent"]

if (cmsLinkComps) {
    main << "# ── CMSLinkComponent ────────────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE CMSLinkComponent; \\\$contentCV[unique=true]; uid[unique=true]; name; linkName[lang=\\\$lang]; url; target(code); visible\\n"
    cmsLinkComps.each { comp ->
        main << "                              ;;" << comp.uid << ";" << quote(comp.name) << ";" << quote(locGet(comp, "getLinkName", BASE_LANG)) << ";" << quote(safeGet { comp.url }) << ";" << (safeGet { comp.target?.code } ?: "") << ";" << boolStr(safeGet { comp.visible }) << "\\n"
    }
    main << "\\n"
}

if (locLinkComps) {
    main << "# ── CMSLocalizedLinkComponent ───────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE CMSLocalizedLinkComponent; \\\$contentCV[unique=true]; uid[unique=true]; name; linkName[lang=\\\$lang]; urlLocalized[lang=\\\$lang]; target(code); visible\\n"
    locLinkComps.each { comp ->
        main << "                                      ;;" << comp.uid << ";" << quote(comp.name) << ";" << quote(locGet(comp, "getLinkName", BASE_LANG)) << ";" << quote(locGet(comp, "getUrlLocalized", BASE_LANG)) << ";" << (safeGet { comp.target?.code } ?: "") << ";" << boolStr(safeGet { comp.visible }) << "\\n"
    }
    main << "\\n"
}

if (paragraphComps) {
    main << "# ── CMSParagraphComponent ───────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE CMSParagraphComponent; \\\$contentCV[unique=true]; uid[unique=true]; name; content[lang=\\\$lang]; visible\\n"
    paragraphComps.each { comp ->
        main << "                                   ;;" << comp.uid << ";" << quote(comp.name) << ";" << quote(locGet(comp, "getContent", BASE_LANG)) << ";" << boolStr(safeGet { comp.visible }) << "\\n"
    }
    main << "\\n"
}

// 5) Generic components
def handledTypes = [
        "CMSLinkComponent", "CMSLocalizedLinkComponent", "CMSParagraphComponent",
        "CMSNavigationEntry"
] as Set

def genericTypes = compsByType.keySet().findAll { !(it in handledTypes) }
def candidates = [
        "urlLink", "external", "styleAttributes",
        "media", "desktopMedia", "mobileMedia", "tabletMedia",
        "wideMedia", "thumbnail", "image", "picture", "logo",
        "navigationNode", "title", "headline", "content", "description",
        "wrapAfter", "showLanguageCurrency", "notice", "visible",
        "actions"
]
def localizedCandidates = ["headline", "content", "description", "title", "urlLink", "notice"]

genericTypes.each { type ->
    def list = compsByType[type]
    if (!list) return
    main << "# ── " << type << " (generic) ─────────────────────────────────────────────────\\n\\n"
    def present = [:]
    candidates.each { attr ->
        def any = list.any { c ->
            def v = safeGet { c."\${attr}" }
            if (v == null) return false
            if (v instanceof Collection) return !v.isEmpty()
            if (v instanceof String) return !v.isEmpty()
            return true
        }
        def anyLoc = (attr in localizedCandidates) && list.any { c -> locGet(c, "get" + attr.capitalize(), BASE_LANG) }
        if (any || anyLoc) present[attr] = anyLoc
    }

    def header = new StringBuilder("INSERT_UPDATE " + type + "; \\\$contentCV[unique=true]; uid[unique=true]; name")
    present.each { attr, isLoc ->
        if (attr == "media" || attr == "thumbnail" || attr == "image" || attr == "picture" || attr == "logo") {
            header << "; " << attr << "(code, \\\$contentCV)"
        } else if (attr in ["desktopMedia", "mobileMedia", "tabletMedia", "wideMedia"]) {
            header << "; " << attr << "(qualifier, \\\$contentCV)"
        } else if (attr == "navigationNode") {
            header << "; navigationNode(uid, \\\$contentCV)"
        } else if (isLoc) {
            header << "; " << attr << "[lang=\\\$lang]"
        } else {
            header << "; " << attr
        }
    }
    main << header.toString() << "\\n"

    list.each { comp ->
        def row = new StringBuilder(";;" + comp.uid + ";" + quote(safeGet { comp.name }))
        present.each { attr, isLoc ->
            def val
            if (attr == "media" || attr == "thumbnail" || attr == "image" || attr == "picture" || attr == "logo") {
                val = safeGet { comp."\${attr}"?.code } ?: ""
            } else if (attr in ["desktopMedia", "mobileMedia", "tabletMedia", "wideMedia"]) {
                val = safeGet { comp."\${attr}"?.qualifier } ?: ""
            } else if (attr == "navigationNode") {
                val = safeGet { comp."\${attr}"?.uid } ?: ""
            } else if (isLoc) {
                val = quote(locGet(comp, "get" + attr.capitalize(), BASE_LANG))
            } else {
                def raw = safeGet { comp."\${attr}" }
                if (raw == null) val = ""
                else if (raw instanceof Boolean) val = raw.toString()
                else val = quote(raw)
            }
            row << ";" << val
        }
        main << row.toString() << "\\n"
    }
    main << "\\n"
}

// 6) Navigation nodes + entries
if (navNodes) {
    main << "# ── CMSNavigationNode ───────────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE CMSNavigationNode; \\\$contentCV[unique=true]; uid[unique=true]; name; parent(uid, \\\$contentCV); title[lang=\\\$lang]\\n"
    navNodes.each { node ->
        def parentUid = parentByChildUid[node.uid] ?: ""
        main << "                               ;;" << node.uid << ";" << quote(node.name) << ";" << parentUid << ";" << quote(locGet(node, "getTitle", BASE_LANG)) << "\\n"
    }
    main << "\\n"
}

if (navEntries) {
    main << "# ── CMSNavigationEntry ──────────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE CMSNavigationEntry; \\\$contentCV[unique=true]; uid[unique=true]; name; navigationNode(uid, \\\$contentCV); item(CMSLinkComponent.uid, CMSLinkComponent.\\\$contentCV)\\n"
    navEntries.each { entry ->
        main << "                                ;;" << entry.uid << ";" << quote(entry.name) << ";" << (safeGet { entry.navigationNode?.uid } ?: "") << ";" << (safeGet { entry.item?.uid } ?: "") << "\\n"
    }
    main << "\\n"

    def nodesWithEntries = navNodes.findAll { safeGet { it.entries }?.size() }
    if (nodesWithEntries) {
        main << "UPDATE CMSNavigationNode; \\\$contentCV[unique=true]; uid[unique=true]; entries(uid, \\\$contentCV)\\n"
        nodesWithEntries.each { node ->
            main << "                        ;;" << node.uid << ";" << (node.entries ?: []).collect { it.uid }.join(",") << "\\n"
        }
        main << "\\n"
    }
}

// 7) CMSInverseRestriction (after components)
if (inverseRestrictions) {
    main << "# ── CMSInverseRestriction ───────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE CMSInverseRestriction; \\\$contentCV[unique=true]; uid[unique=true]; name; originalRestriction(uid, \\\$contentCV)[allownull=true]; components(uid, \\\$contentCV)[mode=append]\\n"
    inverseRestrictions.each { ir ->
        def origUid = safeGet { ir.originalRestriction?.uid } ?: ""
        def comps   = (safeGet { ir.components } ?: []).collect { it.uid }.join(",")
        main << "                                   ;;" << ir.uid << ";" << quote(ir.name) << ";" << origUid << ";" << comps << "\\n"
    }
    main << "\\n"
}

// 8) UPDATE components → restrictions
def compsWithRestrictions = allComps.findAll { safeGet { it.restrictions }?.size() }
if (compsWithRestrictions) {
    main << "# ── Components → restrictions ───────────────────────────────────────────────\\n\\n"
    main << "UPDATE AbstractCMSComponent; \\\$contentCV[unique=true]; uid[unique=true]; restrictions(uid, \\\$contentCV)\\n"
    compsWithRestrictions.each { comp ->
        main << "                           ;;" << comp.uid << ";" << (comp.restrictions ?: []).collect { it.uid }.join(",") << "\\n"
    }
    main << "\\n"
}

// 9) ContentSlot
if (slots) {
    main << "# ── ContentSlot ─────────────────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE ContentSlot; \\\$contentCV[unique=true]; uid[unique=true]; name; active; cmsComponents(uid, \\\$contentCV); restrictions(uid, \\\$contentCV)\\n"
    slots.each { slot ->
        def comps  = (slot.cmsComponents ?: []).collect { it.uid }.join(",")
        def restr  = (safeGet { slot.restrictions } ?: []).collect { it.uid }.join(",")
        main << "                         ;;" << slot.uid << ";" << quote(slot.name) << ";" << boolStr(safeGet { slot.active }) << ";" << comps << ";" << restr << "\\n"
    }
    main << "\\n"
}

// 10) ContentPage (template usually lives in a parent/shared catalog — keep as-is)
def tpl      = safeGet { page.masterTemplate }
def tplCat   = safeGet { tpl?.catalogVersion?.catalog?.id } ?: OUT_CATALOG
def tplVer   = safeGet { tpl?.catalogVersion?.version } ?: OUT_CAT_VER
def pageRestr = (safeGet { page.restrictions } ?: []).collect { it.uid }.join(",")

main << "# ── ContentPage ─────────────────────────────────────────────────────────────\\n\\n"
main << "\\\$pageTplCV = " << cvExpr(tplCat, tplVer) << "\\n"
main << "INSERT_UPDATE ContentPage; \\\$contentCV[unique=true]; uid[unique=true]; name; masterTemplate(uid, \\\$pageTplCV); label; title[lang=\\\$lang]; defaultPage; approvalStatus(code); homepage; restrictions(uid, \\\$contentCV)\\n"
main << "                        ;;" << page.uid << ";" << quote(page.name) << ";" << (safeGet { tpl?.uid } ?: "") << ";" << quote(safeGet { page.label }) << ";" << quote(locGet(page, "getTitle", BASE_LANG)) << ";" << boolStr(safeGet { page.defaultPage }) << ";" << (safeGet { page.approvalStatus?.code } ?: "approved") << ";" << boolStr(safeGet { page.homepage }) << ";" << pageRestr << "\\n\\n"

// 11) ContentSlotForPage
if (slotForPageRels) {
    main << "# ── ContentSlotForPage ──────────────────────────────────────────────────────\\n\\n"
    main << "INSERT_UPDATE ContentSlotForPage; \\\$contentCV[unique=true]; uid[unique=true]; position[unique=true]; page(uid, \\\$contentCV)[unique=true]; contentSlot(uid, \\\$contentCV)\\n"
    slotForPageRels.each { rel ->
        def pos    = safeGet { rel.position } ?: ""
        def pUid   = safeGet { rel.page?.uid } ?: ""
        def sUid   = safeGet { rel.contentSlot?.uid } ?: ""
        main << "                                ;;" << rel.uid << ";" << pos << ";" << pUid << ";" << sUid << "\\n"
    }
    main << "\\n"
}

// ── localized UPDATE per language ────────────────────────────────────────────
def buildLocalized = { String lang ->
    def sb = new StringBuilder()
    sb << "# Export CMS page – localized – lang=" << lang << "\\n"
    sb << "\\\$catalog        = " << OUT_CATALOG << "\\n"
    sb << "\\\$catalogVersion = " << OUT_CAT_VER << "\\n"
    sb << "\\\$contentCV      = " << cvExpr(OUT_CATALOG, OUT_CAT_VER) << "\\n"
    sb << "\\\$lang           = " << lang << "\\n\\n"

    if (medias) {
        sb << "UPDATE Media; \\\$contentCV[unique=true]; code[unique=true]; altText[lang=\\\$lang]; description[lang=\\\$lang]\\n"
        medias.each { m ->
            sb << "            ;;" << m.code << ";" << quote(locGet(m, "getAltText", lang)) << ";" << quote(locGet(m, "getDescription", lang)) << "\\n"
        }
        sb << "\\n"
    }
    if (cmsLinkComps) {
        sb << "UPDATE CMSLinkComponent; \\\$contentCV[unique=true]; uid[unique=true]; linkName[lang=\\\$lang]\\n"
        cmsLinkComps.each { c ->
            sb << "                       ;;" << c.uid << ";" << quote(locGet(c, "getLinkName", lang)) << "\\n"
        }
        sb << "\\n"
    }
    if (locLinkComps) {
        sb << "UPDATE CMSLocalizedLinkComponent; \\\$contentCV[unique=true]; uid[unique=true]; linkName[lang=\\\$lang]; urlLocalized[lang=\\\$lang]\\n"
        locLinkComps.each { c ->
            sb << "                                ;;" << c.uid << ";" << quote(locGet(c, "getLinkName", lang)) << ";" << quote(locGet(c, "getUrlLocalized", lang)) << "\\n"
        }
        sb << "\\n"
    }
    if (paragraphComps) {
        sb << "UPDATE CMSParagraphComponent; \\\$contentCV[unique=true]; uid[unique=true]; content[lang=\\\$lang]\\n"
        paragraphComps.each { c ->
            sb << "                            ;;" << c.uid << ";" << quote(locGet(c, "getContent", lang)) << "\\n"
        }
        sb << "\\n"
    }
    if (navNodes) {
        sb << "UPDATE CMSNavigationNode; \\\$contentCV[unique=true]; uid[unique=true]; title[lang=\\\$lang]\\n"
        navNodes.each { n ->
            sb << "                        ;;" << n.uid << ";" << quote(locGet(n, "getTitle", lang)) << "\\n"
        }
        sb << "\\n"
    }
    def localizedPerType = [:]
    genericTypes.each { type ->
        def list = compsByType[type]
        def attrs = ["headline", "content", "description", "title", "urlLink", "notice"].findAll { attr ->
            list.any { c -> locGet(c, "get" + attr.capitalize(), BASE_LANG) != null }
        }
        if (attrs) localizedPerType[type] = attrs
    }
    localizedPerType.each { type, attrs ->
        def header = new StringBuilder("UPDATE " + type + "; \\\$contentCV[unique=true]; uid[unique=true]")
        attrs.each { a -> header << "; " << a << "[lang=\\\$lang]" }
        sb << header.toString() << "\\n"
        compsByType[type].each { c ->
            def row = new StringBuilder(";;" + c.uid)
            attrs.each { a -> row << ";" << quote(locGet(c, "get" + a.capitalize(), lang)) }
            sb << row.toString() << "\\n"
        }
        sb << "\\n"
    }
    sb << "UPDATE ContentPage; \\\$contentCV[unique=true]; uid[unique=true]; title[lang=\\\$lang]\\n"
    sb << "                  ;;" << page.uid << ";" << quote(locGet(page, "getTitle", lang)) << "\\n\\n"
    return sb.toString()
}

def localized = [:]
EXTRA_LANGS.each { lang ->
    localized[lang] = buildLocalized(lang)
}

def stats = [
    page:            page.uid,
    template:        safeGet { page.masterTemplate?.uid },
    templateCatalog: tplCat + ":" + tplVer,
    sourceCatalog:   CATALOG + ":" + CAT_VERSION,
    targetCatalog:   OUT_CATALOG + ":" + OUT_CAT_VER,
    slots:           slots.size(),
    components:      allComps.size(),
    componentsByType: compsByType.collectEntries { k, v -> [k, v.size()] },
    medias:          medias.size(),
    mediaContainers: mediaContainers.size(),
    navNodes:        navNodes.size(),
    navEntries:      navEntries.size(),
    userRestrictions:    userRestrictions.size(),
    inverseRestrictions: inverseRestrictions.size(),
    otherRestrictions:   otherRestrictions.size()
]

def payload = [
    main:      main.toString(),
    localized: localized,
    stats:     stats
]

return JsonOutput.toJson(payload)
`;
}
