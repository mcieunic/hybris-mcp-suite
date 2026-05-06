# catalog

## Purpose

Core platform extension providing the data model and runtime mechanics for catalog-based content organisation in SAP Commerce Cloud. It defines the foundational types (`Catalog`, `CatalogVersion`, `Category`, `Product`, `ProductReference`, classification system) and the full synchronisation pipeline that moves items from a Staged catalog version to an Online one.

## Character

`core` — pure platform extension. No web module. Depends only on `validation`. Service-layer implementations live in `platformservices` (same platform artifact). The Jalo manager is `de.hybris.platform.catalog.jalo.CatalogManager`.

---

## Key Items

| Type | Table | Notes |
|---|---|---|
| `Catalog` | `Catalogs` | Root container; holds `id`, `defaultCatalog`, `languages`, `activeCatalogVersion` |
| `CatalogVersion` | `CatalogVersions` | Scoped by `version` string + parent Catalog; owns `languages`, `active` flag, `rootCategories` |
| `Category` | `Categories` | Catalog-version-aware; `code` + `catalogVersion` = unique key; tree via supercategories/subcategories |
| `Product` | (core) | Extended by catalog to add `variantType`; unique by `code`+`catalogVersion` |
| `VariantProduct` | (core) | Extends `Product`; base for colour/size variants |
| `ProductReference` | `ProductReferences` | Typed relationship between products (`referenceType` enum) |
| `ProductFeature` | `ProductFeatures` | Classification attribute value stored per product+language |
| `ClassificationSystem` | (Catalogs) | Extends `Catalog`; container for classification taxonomies |
| `ClassificationSystemVersion` | (CatalogVersions) | Extends `CatalogVersion`; scopes classes and attributes |
| `ClassificationClass` | (Categories) | Extends `Category`; groups classification attributes |
| `ClassificationAttribute` | `ClassificationAttrs` | A single classifying attribute within a system version |
| `ClassAttributeAssignment` | `Cat2AttrRel` | Links attribute to class; carries type, mandatory, localized, multiValued flags |
| `AttributeValueAssignment` | `Attr2ValueRel` | Assigns a concrete value to a classification attribute |
| `SyncItemJob` | (Job) | Abstract base for sync jobs; holds source/target CV refs, `effectiveSyncLanguages`, `createNewItems`, `removeMissingItems`, `syncAttributeConfigurations` |
| `CatalogVersionSyncJob` | (SyncItemJob) | Concrete sync job for CV→CV; adds `maxThreads`, `maxSchedulerThreads`, `copyCacheSize` |
| `SyncItemCronJob` | (CronJob) | Execution of a `SyncItemJob`; `fullSync`, `forceUpdate`, `abortOnCollidingSync` |
| `CatalogVersionSyncCronJob` | (SyncItemCronJob) | Adds `statusMessage` and cron job history |
| `ItemSyncTimestamp` | `ItemSyncTimestamps` | Records last sync time per source↔target item pair; `outdated` flag triggers re-sync |
| `SyncAttributeDescriptorConfig` | `SynAttCfg` | Per-attribute sync override: `includedInSync`, `copyByValue`, `untranslatable`, `translateValue`, `partiallyTranslatable`, `presetValue` |
| `ItemSyncDescriptor` | (ChangeDescriptor) | Tracks individual item copy operation during an active cron job |
| `CatalogVersionDifference` | — | View/report type for diff jobs |
| `PreviewTicket` | — | Short-lived token giving preview access to a Staged CV in the storefront |
| `Agreement` | `Agreements` | Commercial agreement linked to a catalog |

---

## Services / Facades / DAO / Strategy

| Interface | Kind | Implementation (bean) | What it does |
|---|---|---|---|
| `CatalogService` | Service | `DefaultCatalogService` (`catalogService`) | Returns all catalogs, looks up by id, manages session CV (legacy) |
| `CatalogVersionService` | Service | `DefaultCatalogVersionService` (`catalogVersionService`) | Session CV management, read/write access checks, `getCatalogVersion(id, version)`, `findDuplicatedIds` |
| `CatalogTypeService` | Service | `DefaultCatalogTypeService` (`catalogTypeService`) | Determines which types are catalog-aware; drives sync type filtering |
| `CategoryService` | Service | `DefaultCategoryService` (`categoryService`) | Root/sub-category traversal; **respects session catalog versions** |
| `ProductService` | Service | `DefaultProductService` (`productService`) | Lookup by code (session-CV-aware) or by code+CV |
| `KeywordService` | Service | `DefaultKeywordService` (`keywordService`) | CRUD for `Keyword` items scoped to a CV |
| `ProductReferenceService` | Service | `DefaultProductReferenceService` (`productReferenceService`) | Finds product references for a source product |
| `CatalogSynchronizationService` | Service | `DefaultCatalogSynchronizationService` (`catalogSynchronizationService`) | Runs full or partial sync; resolves source↔target item pairs; checks sync permissions |
| `SynchronizationStatusService` | Service | `DefaultSynchronizationStatusService` (`synchronizationStatusService`) | Returns `SyncItemInfo`/`SyncItemStatus` for items; lists in/outbound sync jobs |
| `SyncJobApplicableTypesStrategy` | Strategy | `DefaultSyncJobApplicableTypesStrategy` (`syncJobApplicableTypesStrategy`) | Decides whether a given item type should be included in a sync job |
| `CatalogDao` | DAO | `DefaultCatalogDao` (`catalogDao`) | FlexibleSearch-backed catalog lookup |
| `CatalogVersionDao` | DAO | `DefaultCatalogVersionDao` (`catalogVersionDao`) | CV lookup by catalog+version |
| `ItemSyncTimestampDao` | DAO | `DefaultItemSyncTimestampDao` (`itemSyncTimestampDao`) | Queries `ItemSyncTimestamp` by item, CV or job |
| `ProductReferencesDao` | DAO | `DefaultProductReferencesDao` (`productReferencesDao`) | Fetches `ProductReference` items |

---

## Spring Beans Worth Knowing

| Bean id | Class | Purpose |
|---|---|---|
| `SyncItemJobPreparer` | `SyncItemJobPreparer` | PrepareInterceptor — auto-generates `code` for new `SyncItemJob` if blank |
| `syncAttributeDescriptorConfigValidator` | `SyncAttributeDescriptorConfigValidator` | Validates `SyncAttributeDescriptorConfig` before save |
| `syncAttributeDescriptorConfigPreparer` | `SyncAttributeDescriptorConfigPreparer` | Sets defaults on `SyncAttributeDescriptorConfig` |
| `itemSyncTimeStampPreparer` | `ItemSyncTimeStampPreparer` | PrepareInterceptor on `ItemSyncTimestamp` |
| `itemSyncTimeStampValidator` | `ItemSyncTimeStampValidator` | Validates timestamp consistency |
| `syncTimestampsRemoveInterceptor` | `SyncTimestampsRemoveInterceptor` | On Item remove: cleans up related `ItemSyncTimestamp` rows |
| `syncTimestapsForCatalogRemoveInterceptor` | `SyncTimestapsForCatalogVersionRemoveInterceptor` | On CatalogVersion remove: cleans up timestamps |
| `uniqueCatalogItemValidator` | `UniqueCatalogItemInterceptor` | Enforces unique `code`+`catalogVersion` key on all catalog-aware items |
| `checkVersionsRemoveInterceptor` | `CheckVersionsRemoveInterceptor` | Prevents removal of a Catalog that still has CatalogVersions |
| `catalogVersionQueryPreprocessor` | `CatalogVersionQueryPreprocessor` | Injects session CV restrictions into FlexibleSearch queries automatically |
| `europe1.manager` | `CatalogAwareEurope1PriceFactory` | Catalog-aware price factory replacing default Europe1; needed for PDT rows |
| `productFeaturePrepareInterceptor` | `ProductFeaturePrepareInterceptor` | Sets defaults on `ProductFeature` before save |
| `catalogSystemSetup` | `CatalogSystemSetup` | Essential data setup; creates default catalog types on system init |

---

## Entry Points

**CronJobs (KEY):**
- `CatalogVersionSyncJob` / `CatalogVersionSyncCronJob` — the primary Staged→Online sync mechanism. Triggered via Backoffice, HAC, or `CatalogSynchronizationService.synchronize(...)`. The job iterates all source-CV items of applicable types, copies attribute values to the corresponding target-CV item (creating it if `createNewItems=true`), and writes an `ItemSyncTimestamp` per item.
- `CompareCatalogVersionsJob` / `CompareCatalogVersionsCronJob` — produces `CatalogVersionDifference` records between two CVs.
- `RemoveCatalogVersionJob` / `RemoveCatalogVersionCronJob` — safely removes a CV and all its items via ImpEx-backed batch.

**Interceptors acting as business rules:**
- `SyncTimestampsRemoveInterceptor` fires on every Item delete (typeCode=`Item`) to purge orphaned `ItemSyncTimestamp` rows — important for large catalogs because a missed cleanup causes phantom "outdated" flags after re-import.
- `uniqueCatalogItemValidator` fires on every catalog-aware item save; throws `InterceptorException` on duplicate `code`+`catalogVersion`.

---

## Dependencies

- `validation` (direct platform dependency)
- `platformservices` — provides all service/DAO/interceptor implementations; `catalog-spring.xml` is loaded from there
- `europe1` — required for `CatalogAwareEurope1PriceFactory` (PDT rows)

---

## Pitfalls / Gotchas

**Sync language fallback to source CV languages.**
`SyncItemJob.effectiveSyncLanguages` is computed at runtime: if the field is empty, the engine falls back to `sourceCV.languages`. If your target CV supports more languages than the source (e.g. a child catalog adds `cs`/`sk`), those languages are **silently skipped** during sync unless explicitly listed in `effectiveSyncLanguages` or added to the source CV's `languages` collection.

**Cross-catalog FK references during sync.**
When a sync job copies an item whose attribute references an item in a *different* catalog (e.g. a CMS `pageTemplate` pointing to `sniezkaContentCatalog`), the sync engine does **not** remap that FK to the target catalog — the copied item retains the original cross-catalog reference. This is correct for shared resources but means the sync does not create a counterpart in the target catalog for referenced foreign items. Importing cross-catalog references in both Staged and Online separately (rather than relying on sync to carry them) is the safe pattern.

**`SyncAttributeDescriptorConfig` controls per-attribute sync behaviour.**
Setting `includedInSync=false` excludes an attribute entirely. `copyByValue=true` deep-copies collections/relations. `untranslatable=true` copies a localised attribute only once (from the default language). `presetValue` stamps a fixed value into target regardless of source — useful to force `approvalStatus=approved` on Online items.

**`ItemSyncTimestamp.outdated` flag.**
The flag is set to `true` when source item modification time exceeds `lastSyncSourceModifiedTime`. A forced re-import of source items (e.g. ImpEx re-run) resets modification timestamps and marks all timestamps outdated, causing a subsequent incremental sync to re-copy every item. Use `fullSync=false` plus `forceUpdate=false` to run incremental syncs efficiently.

**`removeMissingItems` on `SyncItemJob`.**
If `true`, items present in the target CV but absent from source are deleted during sync. Enabling this on a shared Online CV fed by multiple sync jobs (parent + child catalog pattern) will cause one job to delete items created by the other.

**`CatalogVersionQueryPreprocessor` and session CVs.**
FlexibleSearch automatically appends `{catalogVersion} IN (...)` restrictions based on session catalog versions. Code running without an explicit CV in session (e.g. background threads, CronJob workers) may return no results for catalog-aware types unless the session is seeded with the right CVs beforehand.

**Deleting a Catalog with active CatalogVersion.**
`CheckVersionsRemoveInterceptor` blocks removal of a `Catalog` that still has associated `CatalogVersion` items. Remove all CVs first.
