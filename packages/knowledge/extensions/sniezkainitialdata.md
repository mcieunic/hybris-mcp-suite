# sniezkainitialdata

## Cel
Rozszerzenie odpowiedzialne za inicjalizację danych sklepu Śnieżka PL (rynek polski). Importuje definicje katalogów (content i product), strukturę CMS, konfigurację store/site, Solr oraz dane addonów podczas inicjalizacji i aktualizacji systemu (`SystemSetup`). Jest wzorcem dla rynku CZ/SK (`sniezkaczskinitialdata`).

## Charakter

| Właściwość      | Wartość                              |
|-----------------|--------------------------------------|
| Typ rozszerzenia | `initialdata` (czysto konfiguracyjne, brak własnych item types) |
| Rynek / kraj    | Polska (PL)                          |
| Status          | Produkcyjny, aktywny                 |

## Dependencies

- `sniezkacore`

## Kluczowe items

Brak — rozszerzenie nie definiuje własnych item types ani beans XML.

## Services / Facades / Strategies

Brak własnych. `InitialDataSystemSetup` korzysta z `ImpexImportService` zdefiniowanego w `sniezkacore` (`pl.sniezka.core.configuration.service.impl.DefaultImpexImportService`).

## Spring beany (selektywnie)

| Bean id | Klasa / parent | Rola |
|---------|---------------|------|
| `yAcceleratorInitialDataSystemSetup` | `InitialDataSystemSetup` (parent: `abstractSniezkaSystemSetup`) | Główny SystemSetup — importuje wszystkie impex |
| `abstractSniezkaSystemSetup` | `AbstractSniezkaSystemSetup` (abstract, parent: `abstractCoreSystemSetup`) | Baza z logiką sync katalogów i indeksowania Solr |
| `initialDataImpexImportService` | `DefaultImpexImportService` (sniezkacore) | Importuje impexy z katalogu `maintenance/` (deployed, sprint, current) |
| `sniezkaCategorySource` | parent: `customCategorySource` | Źródło kategorii głównych (rootCategory=1) |
| `sniezkaBrandCategorySource` | parent: `defaultCategorySource` | Źródło kategorii marek (rootCategory=brands) |
| `sniezkaCategoryCodeValueProvider` / `sniezkaCategoryNameValueProvider` | parent: `abstractCategoryCode/NameValueProvider` | Dostawcy wartości Solr dla kategorii |

## Entry points

### SystemSetup (`InitialDataSystemSetup`)

- **ESSENTIAL_DATA** (`Type.ESSENTIAL`, `Process.ALL`): pusty — brak importu.
- **PROJECT_DATA** (`Type.PROJECT`, `Process.ALL`): główna logika uruchamiana przy inicjalizacji i aktualizacji.

Kolejność importu w `createProjectData`:

1. **coredata** (9 impexów):
   - `coredata/common/essential-data.impex` — języki, waluty, kraje
   - `coredata/contentCatalogs/sniezkaContentCatalog/catalog.impex` — definicja content catalog
   - `coredata/contentCatalogs/sniezkaContentCatalog/cms-content.impex` — strony i komponenty CMS
   - `coredata/contentCatalogs/sniezkaContentCatalog/email-content.impex` — szablony e-mail
   - `coredata/productCatalogs/sniezkaProductCatalog/catalog.impex` — definicja product + classification catalog
   - `coredata/productCatalogs/sniezkaProductCatalog/categories-classifications.impex` — kategorie i klasyfikacje
   - `coredata/stores/sniezka/store.impex` — BaseStore (waluty, języki, delivery modes)
   - `coredata/stores/sniezka/site.impex` — CMSSite `sniezka`
   - `coredata/stores/sniezka/solr.impex` — konfiguracja Solr (`sniezkaIndex`)

2. **Sync katalogów** (`sniezkaProductCatalog` → `sniezkaContentCatalog`, Staged→Online), ustawienie zależności sync jobów.

3. **addonData** (14 impexów) — CMS i konfiguracja dla addonów:
   - `adaptivesearchsamplesaddon`
   - `assistedservicestorefront`
   - `b2bacceleratoraddon`
   - `commerceorgaddon`
   - `customerticketingaddon`
   - `smarteditaddon`

4. `coredata/stores/sniezka/custom-configuration.impex`
5. `coredata/stores/sniezka/message-bundle-data.impex`
6. `initialDataImpexImportService.importImpex()` — pliki maintenance z `sniezkainitialdata.main.directory.path=/sniezkainitialdata/maintenance/` (podkatalogi: `deployed`, `sprint`, `current`)
7. **Drugi sync katalogów** (po imporcie maintenance).
8. **Indeksowanie Solr** (`sniezkaIndex`).

### CronJoby

Brak własnych definicji CronJobów w tym rozszerzeniu. Sync job i Solr index są tworzone i uruchamiane inline w `createProjectData` przez `AbstractSystemSetup`.

## Struktura import/

```
resources/sniezkainitialdata/import/
├── coredata/                          # Główne dane inicjalizacyjne
│   ├── common/
│   │   └── essential-data.impex       # Języki, waluty, kraje
│   ├── contentCatalogs/
│   │   └── sniezkaContentCatalog/
│   │       ├── catalog.impex          # Definicja katalogu (pl, en, ru)
│   │       ├── catalog_en.impex       # Lokalizacja EN
│   │       ├── catalog_pl.impex       # Lokalizacja PL
│   │       ├── cms-content.impex      # Strony CMS, szablony, komponenty
│   │       ├── cms-content_en.impex
│   │       ├── cms-content_pl.impex
│   │       ├── email-content.impex    # Szablony e-mail (Velocity)
│   │       ├── email-content_en.impex
│   │       ├── email-content_pl.impex
│   │       ├── emails/                # Pliki .vm szablonów e-mail
│   │       └── images/                # Media do importu (bannery, logo, kategorie)
│   ├── productCatalogs/
│   │   └── sniezkaProductCatalog/
│   │       ├── catalog.impex          # Definicja product + classification catalog
│   │       ├── catalog_en.impex
│   │       ├── catalog_pl.impex
│   │       ├── categories-classifications.impex  # Kategorie i klasyfikacje
│   │       └── categories-classifications_pl.impex
│   └── stores/
│       └── sniezka/
│           ├── store.impex            # BaseStore, delivery modes, promo group
│           ├── site.impex             # CMSSite, sitemap
│           ├── solr.impex             # SolrFacetSearchConfig (sniezkaIndex)
│           ├── solrtrigger.impex      # Trigery Solr
│           ├── custom-configuration.impex  # Konfiguracja custom
│           └── message-bundle-data.impex   # MessageResource bundles
├── addonData/                         # Dane addonów (importowane po pierwszym syncu)
│   ├── adaptivesearchsamplesaddon/    # Konfiguracja Adaptive Search
│   ├── assistedservicestorefront/     # ASM — grupy użytkowników, CMS
│   ├── b2bacceleratoraddon/           # B2B addon — common i CMS
│   ├── commerceorgaddon/              # Commerce org — CMS
│   ├── customerticketingaddon/        # Customer ticketing — CMS
│   ├── secureportaladdon/             # Secure portal — szablony e-mail
│   └── smarteditaddon/               # SmartEdit — użytkownicy, CMS, product catalog
├── documents/                         # Statyczne dokumenty (np. regulaminy)
├── images/                            # Obrazy globalne (niezwiązane z katalogiem)
└── stare impex - nie modyfikowac/     # Archiwum starych impexów (nie używać)
```

Katalog `resources/impex/` (poza `import/`) zawiera 3 legacy essentialdata impex:
- `essentialdata-DataHub.impex`
- `essentialdata-Solr.impex`
- `essentialdata-customizing.impex` — języki systemu (wywoływane przez platformę przy ESSENTIAL_DATA, nie przez `InitialDataSystemSetup`)

## Content catalogs

| Catalog id | Rola |
|------------|------|
| `sniezkaContentCatalog` | Główny content catalog dla rynku PL. Wersje: Staged i Online. Języki: pl, en, ru. Zawiera strony CMS, komponenty, szablony, e-maile, media. Jest wzorcem (parent) dla `czskContentCatalog`. |

## Product catalogs

| Catalog id | Rola |
|------------|------|
| `sniezkaProductCatalog` | Główny katalog produktów dla rynku PL. Wersje: Staged i Online. Języki: pl, en, ru. |
| `sniezkaClassification` | Katalog klasyfikacyjny (ClassificationSystem) dla atrybutów produktów. |

## Pułapki / gotchas

- `createEssentialData` jest puste — essentialdata (języki, Solr) są importowane przez pliki z `resources/impex/` przez mechanizm platformy, a nie przez `InitialDataSystemSetup`.
- `initialDataImpexImportService` importuje pliki z `sniezkainitialdata.main.directory.path=/sniezkainitialdata/maintenance/` z podkatalogów `deployed`, `sprint`, `current` — brak tych plików nie blokuje inicjalizacji, ale może powodować ciche pominięcia.
- Sync katalogów wykonywany jest **dwa razy**: raz po coredata (przed addonData), raz po maintenance — celowe, aby addony miały dostęp do Online.
- Bean id `yAcceleratorInitialDataSystemSetup` pochodzi z nazewnictwa acceleratora SAP — nie odzwierciedla faktycznej klasy.
- Katalog `stare impex - nie modyfikowac/` zawiera spacje w nazwie — może powodować problemy z automatycznymi skryptami.
- `cms-content.impex` i `catalog.impex` nie są re-importowane po syncu, więc zmiany CMS wymagają ręcznego sync lub ponownej inicjalizacji.
