# cms2

## Purpose

Core CMS engine for SAP Commerce Cloud. Defines the full type system for web content management: pages, slots, components, templates, restrictions, navigation, versioning, and workflow. All other CMS extensions (cmsfacades, cmswebservices, acceleratorcms, etc.) build on top of cms2.

## Character

`core` — no web layer, no controllers. Pure service/DAO/interceptor layer plus item type definitions. Registered as a `backoffice-module` (Backoffice CMS Cockpit integration). Requires only `basecommerce`.

## Key items

| Type | Extends | Table | Notes |
|---|---|---|---|
| `CMSItem` | `GenericItem` | — | Base for all CMS objects; carries `uid` + `catalogVersion` (unique together via `cmsItemByUidCvIDX`) |
| `AbstractPage` | `CMSItem` | `CMSPage` | Base page; has `masterTemplate`, `defaultPage`, `approvalStatus`, `onlyOneRestrictionMustApply`, `contentSlots` |
| `ContentPage` | `AbstractPage` | — | Label-based page; `homepage` flag; most common page type |
| `CategoryPage` | `AbstractPage` | — | Resolves by category |
| `ProductPage` | `AbstractPage` | — | Resolves by product |
| `CatalogPage` | `AbstractPage` | — | Resolves by catalog |
| `PageTemplate` | `CMSItem` | `PageTemplate` | Master template; defines which slot positions exist via CSFT |
| `ContentSlot` | `CMSItem` | `ContentSlot` | Container of components; CatalogVersion-aware |
| `ContentSlotForTemplate` | `CMSRelation` | `SlotsForTemplate` | Links slot to template at a named `position`; `allowOverwrite` flag |
| `ContentSlotForPage` | `CMSRelation` | `SlotsForPage` | Overrides a slot for a specific page at `position` |
| `AbstractCMSComponent` | `CMSItem` | `CMSComponent` | Base component; `visible`, `onlyOneRestrictionMustApply`, `styleClasses`, `restricted` |
| `SimpleCMSComponent` | `AbstractCMSComponent` | — | Leaf component base (no children) |
| `AbstractCMSComponentContainer` | `AbstractCMSComponent` | — | Container component; exposes `currentCMSComponents` |
| `CMSFlexComponent` | `SimpleCMSComponent` | — | Delegates rendering to a named Spring bean (`flexType`) |
| `CMSLinkComponent` | `SimpleCMSComponent` | — | Link with URL/category/product/page target |
| `CMSParagraphComponent` | `SimpleCMSComponent` | — | Rich-text paragraph |
| `CMSImageComponent` | `SimpleCMSComponent` | — | Localized media reference |
| `AbstractRestriction` | `CMSItem` | `Restriction` | Base restriction; evaluated at runtime |
| `CMSTimeRestriction` | `AbstractRestriction` | — | Active between `activeFrom`/`activeUntil` |
| `CMSUserRestriction` | `AbstractRestriction` | — | Matches specific users |
| `CMSUserGroupRestriction` | `AbstractRestriction` | — | Matches user groups |
| `CMSCategoryRestriction` | `AbstractRestriction` | — | Matches current category (optionally recursive) |
| `CMSProductRestriction` | `AbstractRestriction` | — | Matches current product |
| `CMSCatalogRestriction` | `AbstractRestriction` | — | Matches catalog |
| `CMSInverseRestriction` | `AbstractRestriction` | — | Negates another restriction |
| `CMSSite` | `BaseSite` | — | Extends BaseSite with CMS-specific site configuration |
| `CMSRelation` | `GenericItem` | `CMSRelations` | Base for CSFP/CSFT; carries `uid`+`catalogVersion` (unique index `cmsRelationByUidCvIdx`) |

## Services / Facades / DAO / Strategy

| Interface | Kind | Implementation bean | What it does |
|---|---|---|---|
| `CMSSiteService` | Service | `defaultCMSSiteService` | Resolves current `CMSSite`, its `ContentCatalog`, active `CatalogVersion`; entry point for session CMS context |
| `CMSPageService` | Service | `defaultCMSPageService` | Resolves page by label, category, product, or type; picks best match across catalog hierarchy using `cmsCatalogLevelService` |
| `CMSContentPageService` | Service | `defaultCMSContentPageService` | Specialised page lookup for `ContentPage` (label/homepage); used by acceleratorcms slot resolvers |
| `CMSAdminContentSlotService` | Admin Service | `defaultCMSAdminContentSlotService` | Reads slot-for-page and slot-for-template relations; merges template slots with page overrides; used by Backoffice/SmartEdit |
| `CMSContentSlotService` | Service | `defaultCMSContentSlotService` | Runtime slot access; resolves `ContentSlot` for a given page position, applies restriction evaluation |
| `CMSRestrictionService` | Service | `defaultCMSRestrictionService` | Evaluates restriction list on a page/component; delegates to `CMSRestrictionEvaluatorRegistry` |
| `CMSRestrictionEvaluatorRegistry` | Registry | `cmsRestrictionEvaluatorRegistry` | Holds all `CMSRestrictionEvaluatorMapping` beans; dispatches evaluation by restriction `typeCode` |
| `CMSAdminSiteService` | Admin Service | `defaultCMSAdminSiteService` | Admin-layer site/CV access, bypasses session search restrictions |
| `CMSAdminPageService` | Admin Service | `defaultCMSAdminPageService` | Admin-layer page lookup (Backoffice/SmartEdit); no session search restriction |
| `CMSAdminComponentService` | Admin Service | `defaultCMSAdminComponentService` | Manages component CRUD with uid generation; used by SmartEdit/Backoffice |
| `CMSNavigationService` | Service | `defaultCMSNavigationService` | Navigation node and entry management |
| `CMSPreviewService` | Service | `defaultCMSPreviewService` | Creates/resolves `CMSPreviewTicket` for SmartEdit preview sessions |
| `CMSComponentService` | Service | `defaultCMSComponentService` | Component lookup by uid/type; visible component filtering |
| `CMSPageCloningStrategy` | Strategy | `defaultCmsPageCloningStrategy` | Deep-clones pages including slots and components |
| `CMSAdminContentSlotService` (DAO) | DAO | `cmsContentSlotDao` / `cmsPageDao` | FlexibleSearch-backed DAO for slot and page queries |

## Spring beans worth knowing

| Bean id | Class / note |
|---|---|
| `ContentSlotForPageInterceptor` | `ContentSlotForPageValidateInterceptor` — rejects duplicate `(position, page, contentSlot)` tuples; causes silent import failures if triple already exists |
| `ContentSlotForTemplateInterceptor` | `ContentSlotForTemplateValidateInterceptor` — similar uniqueness guard for CSFT |
| `contentSlotForPagePrepareInterceptor` | Sets default values on CSFP before save; calls `itemModelPrepareInterceptorService` |
| `cmsAbstractComponentPrepareInterceptor` | Stamps `typeCode` on every component before persist |
| `cmsAbstractRestrictionPrepareInterceptor` | Stamps `typeCode` on every restriction before persist |
| `cmsRestrictionEvaluatorRegistry` | Central registry; add new evaluator mappings via `listMergeDirective` on `cmsRestrictionEvaluatorMappings` |
| `cmsCatalogRestrictionEvaluator` | Evaluates `CMSCatalogRestriction` |
| `cmsCategoryRestrictionEvaluator` | Evaluates `CMSCategoryRestriction` |
| `cmsTimeRestrictionEvaluator` | Evaluates `CMSTimeRestriction` against session time |
| `cmsUserGroupRestrictionEvaluator` | Evaluates `CMSUserGroupRestriction` |
| `cmsBaseStoreTimeRestrictionEvaluator` | Time restriction scoped to base store; wraps `cmsTimeRestrictionEvaluator` |
| `catalogVersionRemoveInterceptor` | Blocks removal of a `CatalogVersion` that still owns CMS items |
| `cmsItemCatalogLevelComparator` | Compares items across multi-country catalog hierarchy; used by page/slot resolution to prefer child-catalog items |
| `cms2ActivateBaseSiteInSessionStrategy` | Deprecated since 1811; sets CMS CV in session on site activation |
| `cmsPageCloningStrategy` | Full page deep-clone including CSFP relations; used by Backoffice "copy page" |

## Entry points

- **Controllers:** none (core extension only)
- **CronJobs:** none defined in cms2 (versioning GC is in a sub-config but triggered externally)
- **Business processes:** workflow actions `approvePageAutomatedWorkflowAction`, `rejectEditingAutomatedWorkflowAction`, `lockPageAutomatedWorkflowAction` (registered as `scope="prototype"`)
- **Other:**
  - `ContentSlotForPageValidateInterceptor` (ValidateInterceptor on `ContentSlotForPage`) — uniqueness guard
  - `ContentSlotForTemplateValidateInterceptor` (ValidateInterceptor on `ContentSlotForTemplate`) — uniqueness guard
  - `relatedPagePrepareInterceptorMapping` (PrepareInterceptor on `CMSItem`) — cascades page dirty-marking when slot relations change
  - `catalogVersionRemoveInterceptor` — blocks CV deletion when CMS items exist
  - `CMSRelatedPageRejectionService` — prevents circular slot-to-page dependencies

## Slot resolution chain (runtime)

1. `CMSSiteService` resolves the active `CatalogVersion` from the current session/site.
2. `CMSPageService` resolves the best `AbstractPage` (by label, category, product) — walks catalog hierarchy via `cmsCatalogLevelService`; prefers child-catalog page, falls back to default page.
3. `CMSAdminContentSlotService.getContentSlotsForPage()` merges two sources:
   - **CSFT** (`ContentSlotForTemplate`) — default slots from the page's `masterTemplate`; used when `allowOverwrite=true` and no CSFP override exists.
   - **CSFP** (`ContentSlotForPage`) — page-specific overrides; take precedence over CSFT at the same `position`.
4. `CMSRestrictionService` evaluates restriction lists on the resolved page and each component (`onlyOneRestrictionMustApply` flag controls AND vs OR semantics).

## Dependencies

- **Requires:** `basecommerce`
- **Used by:** `acceleratorcms`, `cmsfacades`, `cmswebservices`, `cms2lib`, `cmsbackoffice`, all storefront accelerators

## Pitfalls / gotchas

- `CMSItem.uid` is unique **per CatalogVersion**, not globally. Cross-CV clashes are valid and intentional (inheritance pattern). Never assume a uid is unique across catalogs.
- `ContentSlotForPageValidateInterceptor` enforces uniqueness of the `(position, page, contentSlot)` triple at Java level (not DB index). A bulk impex that inserts a CSFP whose triple already exists will be silently rejected or throw an interceptor exception — scan existing records before import.
- `ContentSlotForTemplate.allowOverwrite=false` makes the slot read-only from the template side; a CSFP for the same position on a concrete page will still override it at runtime.
- CatalogVersion sync does **not** remap cross-catalog FK references (e.g. `PageTemplate` pointing to parent catalog's `sniezkaContentCatalog:Staged`). If a child catalog's page references a parent-catalog template, both Staged and Online must be imported independently.
- `CMSRestrictionService` evaluation uses session context (current user, current time, current category). If called outside a proper storefront session (e.g., in a CronJob), restrictions may evaluate incorrectly — use `cmsSessionSearchRestrictionsDisabler` to disable them.
- `AbstractPage.onlyOneRestrictionMustApply=true` means OR logic (any restriction passes → page shown). Default `false` means AND logic (all restrictions must pass).
