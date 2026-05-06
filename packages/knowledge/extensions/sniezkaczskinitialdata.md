# sniezkaczskinitialdata

## Cel

Rozszerzenie obsługuje rollout platformy B2B Śnieżka na rynki CZ i SK. Dla obu krajów powstaje jeden wspólny store (`czsk`) oraz jeden content catalog `czskContentCatalog`, który dziedziczy po `sniezkaContentCatalog` (katalog macierzysty PL). Rozszerzenie zawiera wyłącznie dane inicjalne — impexy z różnicami względem parent katalogu, konfigurację store'u i site'u oraz CMS override'y specyficzne dla CZ/SK.

## Charakter

| Atrybut | Wartość |
|---|---|
| Typ | initialdata (dane inicjalne + setup) |
| Rynek | CZSK (Czechy + Słowacja, jeden wspólny store) |
| Status | Active rollout |

## Dependencies

- `sniezkacore` (jedyna zadeklarowana zależność w `extensioninfo.xml`)

## Kluczowe items

Brak własnych typów w `items.xml` — rozszerzenie nie definiuje nowych typów danych.

## Services / Facades / Strategies

| Klasa | Opis |
|---|---|
| `CzSkCoreDataImportService` | Nadpisuje `synchronizeProductCatalog` — pomija sync gdy `catalogName` jest pusty (zabezpieczenie przed sync katalogu produktów przy braku nazwy) |
| `CzSkSampleDataImportService` | Analogiczne nadpisanie dla `SampleDataImportService` |

## Spring beany (selektywnie)

| Bean id | Klasa | Parent |
|---|---|---|
| `czSkCoreDataImportService` | `CzSkCoreDataImportService` | `defaultCoreDataImportService` |
| `czSkSampleDataImportService` | `CzSkSampleDataImportService` | `defaultSampleDataImportService` |
| `sniezkaczskinitialdataSystemSetup` | `SniezkaczskinitialdataSystemSetup` | `abstractCoreSystemSetup` |

## Entry points

### SystemSetup — `SniezkaczskinitialdataSystemSetup`

Adnotacja: `@SystemSetup(extension = "sniezkaczskinitialdata")`

Metoda `createProjectData` uruchamiana przy `Type.PROJECT, Process.ALL`.

**Kolejność operacji:**

1. `getCoreDataImportService().execute(...)` — importuje coredata dla katalogów `czsk`, `sniezka` i store'u `czsk` (pliki wykrywane automatycznie przez framework)
2. `catalog-languages.impex` — dodaje `cs`, `sk` do languages `sniezkaContentCatalog:Staged/Online`
3. `sync-attribute-config.impex` — konfiguruje `czskContentCatalog` sync (wyklucza `AbstractCMSComponent:slots` z synca)
4. `message-bundle-data_cs.impex` + `_sk.impex` — bundle wiadomości dla store'u czsk
5. `qualitative-complaints-localization_cs.impex` + `_sk.impex` — tłumaczenia reklamacji
6. `getSampleDataImportService().execute(...)` — importuje sampledata (pliki CMS wykrywane automatycznie)
7. **Manualne importy sampledata** (64 wywołania `importImpexFile`):
   - `sniezkaContentCatalog/cms-content-inherited_cs.impex` + `_sk` — tłumaczenia CS/SK komponentów w katalogu sniezka (MiniCart, linki nawigacji, FAQ, paragrafy onboarding, itp.)
   - `sniezkaContentCatalog/cms-responsive-content-privacypolicy_cs.impex` + `_sk`
   - `sniezkaContentCatalog/cms-responsive-content-termsandconditions.impex` + `_cs` + `_sk`
   - `sniezkaContentCatalog/cms-logininstructions-media.impex`
   - `czskContentCatalog/cms-responsive-content-logo-footer.impex` + `_cs` + `_sk` + `_en` + `_pl` — logo i stopka
   - `czskContentCatalog/cms-responsive-content-pages.impex` + `_cs` — strony ogólne
   - `czskContentCatalog/cms-logininstructions-page.impex`
   - `czskContentCatalog/cms-responsive-content-homepage.impex` + `_cs` + `_sk` + `_pl` + `_en` — homepage z banerami, slotami
   - `czskContentCatalog/cms-responsive-content-aboutuspage.impex` + `_cs` + `_sk`
   - `czskContentCatalog/cms-responsive-content-moja-strefa.impex` + `_cs` + `_en` + `_pl` + `_ru` + `_sk`
   - `czskContentCatalog/cms-faq.impex` + `_cs`
   - `czskContentCatalog/cms-responsive-content-cartpage.impex` + `_cs`
   - `czskContentCatalog/cms-responsive-content-orders.impex` + `_cs`
   - `czskContentCatalog/cms-responsive-content-invoices.impex`
   - `czskContentCatalog/cms-responsive-content-cookies.impex` + `_cs` + `_sk`
   - `czskContentCatalog/cms-hide-chatbot_cs.impex` + `_sk` + `_en` + `_pl` — ukrycie chatbota
   - `czskContentCatalog/cms-responsive-content-categories.impex`
   - `czskContentCatalog/promotions-content.impex` (z coredata)
   - `czskContentCatalog/cms-responsive-content-termsandconditions-czsk.impex` + `_cs` + `_sk` + `_pl` + `_en`
   - `czskContentCatalog/cms-responsive-content-privacypolicy-czsk.impex` + `_cs` + `_sk` + `_pl` + `_en`
   - `czskContentCatalog/cms-responsive-page-slot-overrides.impex` — masowe CSFP override'y dla stron z parent katalogu
8. `createContentCatalogSyncJob` + `executeCatalogSyncJob` dla `sniezkaContentCatalog`
9. `createContentCatalogSyncJob` + `executeCatalogSyncJob` dla `czskContentCatalog`
10. `czskContentCatalog/cms-responsive-template-slot-overrides.impex` — override'y CSFT (po syncu!)

## czskContentCatalog

**Definicja katalogu** (`coredata/contentCatalogs/czskContentCatalog/catalog.impex`):

```
INSERT_UPDATE ContentCatalog; id[unique=true]      ; superCatalog(id)
                            ; czskContentCatalog   ; sniezkaContentCatalog
```

Katalog dziedziczy po `sniezkaContentCatalog` poprzez `superCatalog`.

**Languages na CatalogVersion:**

| CV | Języki |
|---|---|
| `czskContentCatalog:Staged` | cs, sk, pl, en |
| `czskContentCatalog:Online` | cs, sk, pl, en |
| `sniezkaContentCatalog:Staged/Online` | pl, en, ru, cs, sk (dołączane przez `catalog-languages.impex`) |

**Typowe wzorce overridów:**

- Nowe komponenty z sufiksem `-CZSK` w uid (np. `HomepageTopBanner1-CZSK`, `TopHeaderSlot-Homepage-CZSK`)
- `ContentSlotForPage` (CSFP) kopiowany do `czskContentCatalog:Staged` z referencją do slotów z `sniezkaContentCatalog:Online` (stały ref na Online)
- `ContentPage` kopiowane do `czskContentCatalog` z `masterTemplate` wskazującym na `sniezkaContentCatalog:Online`
- Tłumaczenia CS/SK w `sniezkaContentCatalog:Staged` (UPDATE komponentów z `$lang = cs/sk`)

## Struktura import/

```
resources/sniezkaczskinitialdata/import/
├── coredata/
│   ├── common/
│   │   ├── essential-data.impex           # dane bazowe (języki, waluty)
│   │   ├── essential-data_cs.impex
│   │   ├── essential-data_sk.impex
│   │   ├── qualitative-complaints-localization_cs.impex
│   │   └── qualitative-complaints-localization_sk.impex
│   ├── contentCatalogs/
│   │   ├── czskContentCatalog/
│   │   │   ├── catalog.impex              # definicja katalogu + inheritance
│   │   │   ├── sync-attribute-config.impex
│   │   │   └── promotions-content.impex
│   │   └── sniezkaContentCatalog/
│   │       └── catalog-languages.impex    # dodaje cs/sk do sniezkaContentCatalog
│   └── stores/
│       └── czsk/
│           ├── store-responsive.impex     # BaseStore czsk
│           ├── store-responsive_en.impex
│           ├── site-responsive.impex      # BaseSite czskSite
│           ├── site-responsive_cs.impex
│           ├── site-responsive_sk.impex
│           ├── site-responsive_en.impex
│           ├── solr.impex                 # konfiguracja Solr
│           ├── solr_cs.impex
│           ├── message-bundle-data.impex
│           ├── message-bundle-data_cs.impex
│           └── message-bundle-data_sk.impex
└── sampledata/
    ├── contentCatalogs/
    │   ├── czskContentCatalog/            # CMS override'y dla czsk (strony, sloty, komponenty)
    │   │   ├── images/                    # media per język: _cs/, _sk/, _en/, _pl/
    │   │   ├── cms-responsive-content-homepage.impex + _cs/_sk/_pl/_en
    │   │   ├── cms-responsive-content-pages.impex + _cs
    │   │   ├── cms-responsive-content-logo-footer.impex + _cs/_sk/_pl/_en
    │   │   ├── cms-responsive-content-aboutuspage.impex + _cs/_sk
    │   │   ├── cms-responsive-content-moja-strefa.impex + _cs/_en/_pl/_ru/_sk
    │   │   ├── cms-faq.impex + _cs
    │   │   ├── cms-responsive-content-cartpage.impex + _cs
    │   │   ├── cms-responsive-content-orders.impex + _cs
    │   │   ├── cms-responsive-content-invoices.impex
    │   │   ├── cms-responsive-content-cookies.impex + _cs/_sk
    │   │   ├── cms-responsive-content-termsandconditions-czsk.impex + _cs/_sk/_pl/_en
    │   │   ├── cms-responsive-content-privacypolicy-czsk.impex + _cs/_sk/_pl/_en
    │   │   ├── cms-hide-chatbot_cs/_sk/_en/_pl.impex
    │   │   ├── cms-responsive-content-categories.impex
    │   │   ├── cms-responsive-page-slot-overrides.impex  # masowe CSFP do czsk
    │   │   ├── cms-responsive-template-slot-overrides.impex  # CSFT (ładowany po syncu)
    │   │   ├── cms-logininstructions-page.impex
    │   │   └── email-content.impex
    │   └── sniezkaContentCatalog/         # tłumaczenia CS/SK do istniejących komponentów PL
    │       ├── cms-content-inherited_cs.impex + _sk
    │       ├── cms-content_cs.impex + _sk
    │       ├── cms-responsive-content_cs.impex + _sk
    │       ├── cms-responsive-content-privacypolicy_cs.impex + _sk
    │       ├── cms-responsive-content-termsandconditions.impex + _cs/_sk
    │       └── cms-logininstructions-media.impex
    ├── productCatalogs/
    │   └── sniezkaProductCatalog/         # brak oddzielnego katalogu produktów dla czsk
    ├── sites/
    │   └── czsk/
    │       └── user-groups.impex          # grupy użytkowników czskSite
    └── stores/
        └── czsk/
            └── warehouses.impex
```

## Konwencje impexów w tym extension

- **Header ConfigPropertyImportProcessor** — każdy plik zaczyna się od:
  ```
  UPDATE GenericItem[processor = de.hybris.platform.commerceservices.impex.impl.ConfigPropertyImportProcessor]; pk[unique = true]
  ```
- **Zmienne na początku** — standardowy zestaw:
  ```
  $czskContentCatalog = czskContentCatalog
  $sniezkaContentCatalog = sniezkaContentCatalog
  $contentCV = catalogVersion(... [default=$czskContentCatalog:Staged])
  $sniezkaContentCV = catalogVersion(... [default=$sniezkaContentCatalog:Staged])
  $sniezkaContentOnlineCV = catalogVersion(... [default=$sniezkaContentCatalog:Online])
  ```
- **Sufiksy językowe** — plik z polami zlokalizowanymi nosi sufiks `_cs`, `_sk`, `_pl`, `_en`; plik bez sufiksu zawiera strukturę/dane neutralne językowo
- **Brak tłumaczeń** — zamiast tłumaczenia wartości na cs/sk dodawany jest prefiks `"cs:..."` lub `"sk:..."` (placeholder dla tłumacza)
- **Wzorzec inheritance** — strony kopiowane do `czskContentCatalog:Staged`, z `masterTemplate` wskazującym na `sniezkaContentCatalog:Online`; CSFP dla slotów dziedziczonych referencjonuje `sniezkaContentCatalog:Online` (stała ref), dla slotów własnych czsk referencjonuje `czskContentCatalog:Staged`

## Pułapki / gotchas

- **CSFP unique tuple** — interceptor odrzuca INSERT jeśli triple `(position, page, contentSlot)` już istnieje w danym CV; przy bulk-imporcie `cms-responsive-page-slot-overrides.impex` należy najpierw sprawdzić DB i pominąć już pokryte tuple, żeby nie dostać cichego błędu
- **Sync languages** — `CatalogVersionSyncJob` fallbackuje do `sourceCV.languages`; cs/sk muszą być na liście języków `sniezkaContentCatalog` (dlatego `catalog-languages.impex` jest ładowany jawnie przed executem core data)
- **Page-ref musi pasować do katalogu** — w impexach czsk: `page(uid, $contentCV)` musi wskazywać na stronę w `czskContentCatalog`; użycie `$sniezkaCV` spowoduje, że slot będzie cicho pusty mimo poprawnego importu
- **CSFT override działa, ale uwaga na FK** — można nadpisać `ContentSlotForTemplate` (CSFT) w czsk; pułapka to cross-catalog FK `pageTemplate → sniezka`; sync Staged→Online nie remapuje go automatycznie — trzeba importować CSFT do obu CV osobno
- **cms-responsive-template-slot-overrides.impex ładowany po syncu** — celowo na końcu, po `executeCatalogSyncJob`, żeby override CSFT nie został nadpisany synciem z parent katalogu
- **Osobne komponenty zamiast inheritance** — preferować nowy uid z sufiksem `-CZSK` zamiast nadpisywania uid z parent katalogu w czskContentCatalog; nadpisanie parent uid może spowodować kolizje przy syncu
- **BaseSite uid** — uid to `czskSite` (nie `czsk`); w Java site-guardach używać `"czskSite".equals(site.getUid())`
- **HomepageBannerComponent wymaga bgImage** — controller zgłasza NPE gdy `bgImage` jest null; zawsze ustawiać media lub dodać null-check w kontrolerze
- **CzSkCoreDataImportService / CzSkSampleDataImportService** — nadpisują `synchronizeProductCatalog` tylko żeby pominąć sync gdy `catalogName` jest pusty (store czsk nie ma dedykowanego product catalog — używa `sniezkaProductCatalog`)
