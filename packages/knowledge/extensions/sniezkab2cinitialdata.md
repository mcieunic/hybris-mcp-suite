# sniezkab2cinitialdata

## Cel

Inicjalizacja danych dla polskiego sklepu B2C Śnieżki: content catalog, store, site, Solr index, addony CMS, szablony e-mail i dane maintanance.

## Charakter

Rozszerzenie czysto-datowe (brak `items.xml`, brak nowych typów). Zawiera impex'y uruchamiane przez `@SystemSetup` oraz katalog `maintenance/` z impex'ami hotfixowymi importowanymi automatycznie przez `DefaultImpexImportService`.

## Dependencies

- `sniezkainitialdata` (parent; `requires-extension`)

## Kluczowe items

| Item | Wartość |
|---|---|
| ContentCatalog | `sniezkaB2CContentCatalog` (języki: pl, en, ru) |
| Allegro ContentCatalog | `allegro-sniezkaB2CContentCatalog` (nie używany) |
| BaseStore | `sniezkab2c` (waluta PLN, język pl) |
| CMSSite | `sniezkab2c` (kanał B2C) |
| ProductCatalog | `sniezkaProductCatalog` (tylko referencja, definicja w `sniezkainitialdata`) |
| SolrFacetSearchConfig | `sniezkab2cIndex` (typ: `sniezkab2cProductType`, języki: pl, en, ru) |
| PromotionGroup | `sniezkab2cPromoGrp` |
| Vendor | `sniezka` (Śnieżka) |

## Spring beany

| Bean id | Klasa / parent |
|---|---|
| `initialb2cDataImpexImportService` | `DefaultImpexImportService` – skanuje `maintenance/`, katalogi: `deployed`, `sprint`, `current` |
| `yb2cAcceleratorInitialDataSystemSetup` | `InitialDataSystemSetup` (parent: `abstractSniezkaSystemSetup`) |
| `sniezkaCategoryCodeValueProvider` | parent `abstractCategoryCodeValueProvider`, source: `sniezkaCategorySource` |
| `sniezkaBrandCategoryCodeValueProvider` | parent `abstractCategoryCodeValueProvider`, source: `sniezkaBrandCategorySource` (root: `brands`) |
| `sniezkaVariantCategoryCodeValueProvider` | parent `abstractCategoryCodeValueProvider`, source: `sniezkaVariantCategorySource` |
| `sniezkaCategoryNameValueProvider` | parent `abstractCategoryNameValueProvider` |
| `sniezkaBrandCategoryNameValueProvider` | parent `abstractCategoryNameValueProvider` |

## Entry points

### `InitialDataSystemSetup`

Klasa: `pl.sniezka.b2cinitialdata.setup.InitialDataSystemSetup`  
Adnotacja: `@SystemSetup(extension = "sniezkab2cinitialdata")`

**`createEssentialData`** – `Type.ESSENTIAL, Process.ALL` – pusta metoda (hook gotowy).

**`createProjectData`** – `Type.PROJECT, Process.ALL`:

1. Import coredata (kolejność):
   - `coredata/common/essential-data.impex`
   - `coredata/contentCatalogs/sniezkaB2CContentCatalog/catalog.impex`
   - `coredata/contentCatalogs/sniezkaB2CContentCatalog/cms-content.impex`
   - `coredata/contentCatalogs/sniezkaB2CContentCatalog/email-content.impex`
   - `coredata/stores/sniezkab2c/store.impex`
   - `coredata/stores/sniezkab2c/site.impex`
   - `coredata/stores/sniezkab2c/solr.impex`
2. `createContentCatalogSyncJob` (`sniezkaB2CContentCatalog`)
3. `createProductCatalogSyncJob` (`sniezkaProductCatalog`)
4. `assignDependentSyncJobs` (B2C content zależy od product)
5. `performCatalogSync`
6. Import addonData (assistedservicestorefront, adaptivesearchsamplesaddon, customerticketingaddon, smarteditaddon)
7. `coredata/stores/sniezka/custom-configuration.impex` + `message-bundle-data.impex`
8. `initialDataImpexImportService.importImpex()` – maintenance
9. `performCatalogSync` (ponownie)
10. `performIndex` – uruchamia `sniezkab2cIndex`

## Struktura import/

```
import/
├── coredata/
│   ├── common/
│   │   └── essential-data.impex          # CMSSite + Vendor
│   ├── contentCatalogs/
│   │   └── sniezkaB2CContentCatalog/
│   │       ├── catalog.impex / _pl / _en  # ContentCatalog + CatalogVersion
│   │       ├── cms-content.impex / _pl / _en  # PageTemplates, CMS pages, slots
│   │       ├── email-content.impex / _pl / _en  # EmailPageTemplate + velocity templates
│   │       ├── emails/                    # velocity (.vm) pliki e-mail
│   │       └── images/                    # media do CMS
│   └── stores/
│       └── sniezkab2c/
│           ├── store.impex / _pl / _en    # BaseStore, DeliveryMode
│           ├── site.impex / _pl / _en     # CMSSite, SiteMap, CartRemoval CronJob
│           ├── solr.impex / _pl / _en     # SolrFacetSearchConfig, indeksowane pola, sorty, rangi cen
│           └── solrtrigger.impex          # trigger dla Solr CronJob
├── addonData/
│   ├── adaptivesearchsamplesaddon/        # produkty addon + użytkownicy
│   ├── assistedservicestorefront/         # user-groups, common, cms-content
│   ├── customerticketingaddon/            # cms-content
│   └── smarteditaddon/                   # user-groups, common, cms-content
└── maintenance/
    ├── deployed_YYYY_MM_*/               # archiwalne hotfixy wg daty deploymentu
    ├── EXDEV-5688/                       # hotfixy per ticket
    └── current/                          # impex'y aktualnie wdrażane (skanowane)
```

## Content/Product catalogs

| Katalog | Typ | Języki | Uwagi |
|---|---|---|---|
| `sniezkaB2CContentCatalog` | ContentCatalog | pl, en, ru | definiowany w tym rozszerzeniu |
| `allegro-sniezkaB2CContentCatalog` | ContentCatalog | pl, en, ru | zdefiniowany ale oznaczony jako nieużywany |
| `sniezkaProductCatalog` | ProductCatalog | — | referencja; definicja w `sniezkainitialdata` |
| `sniezkaClassification` | ClassificationCatalog v1.0 | — | referencja w Solr |

Sync: `sniezkaB2CContentCatalog` jest ustawiony jako zależny od `sniezkaProductCatalog` (najpierw sync produktów).

## Pułapki / gotchas

- **Maintenance auto-import** skanu je podkatalogi wg property `sniezkab2cinitialdata.directories.to.import=deployed,sprint,current` w ścieżce `maintenance/`. Zmiana tej listy wpływa na to, co jest importowane przy `update`. Folder `current/` jest przeznaczony do aktywnych zmian.
- **Podwójny sync i indeks** w `createProjectData` – pierwszy sync przed addonami, drugi po maintenance. Upewnij się, że impex maintenance nie zakłada, że addony już są zaimportowane przed pierwszym syncem.
- **Allegro catalog** istnieje w bazie ale nie jest podpięty do żadnego site. Nie usuwać, bo może być zależność na poziomie produktów.
- **Języki Solr** (`pl, en, ru`) muszą być na liście `CatalogVersion.languages` – inaczej sync je pomija (patrz gotcha o `catalog_sync_languages_gotcha`).
- **`sniezkab2cIndex`** korzysta z customowych value providerów (`sniezkaCategoryCodeValueProvider`, `sniezkaBrandCategoryCodeValueProvider`) zdefiniowanych w tym samym spring XML – nie są odziedziczone z `sniezkainitialdata`.
- Plik `catalog.impex` definiuje języki `pl,en,ru` bez spacji przed przecinkami – styl do zachowania w nowych impex'ach dla tego katalogu.
